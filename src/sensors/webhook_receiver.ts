import type { WebhookEvent } from '@/types'
import { createSpan } from '@/utils/span'
import { triggerPolicies, POLICY_TRIGGERS } from '@/execution/policy_agent'
import { useTaskStore } from '@/stores/tasks'
import { v4 as uuidv4 } from 'uuid'
import { getWebhookSecurity } from '@/security/webhook_security'

export interface WebhookConfig {
  id: string
  name: string
  secret?: string
  enabled: boolean
  autoCreateTask?: boolean
  policyTrigger?: string
  provider?: 'github' | 'telegram' | 'generic'
  requireSignature?: boolean
  maxPayloadSize?: number
}

/**
 * Webhook Receiver - Handle incoming webhooks with comprehensive security
 */
export class WebhookReceiver {
  private configs: Map<string, WebhookConfig> = new Map()
  private events: WebhookEvent[] = []
  private security = getWebhookSecurity()
  private recentHashes = new Map<string, number>() // For deduplication

  constructor() {
    this.loadConfigs()
    // Cleanup task runs every 5 minutes
    setInterval(() => this.cleanupOldData(), 5 * 60 * 1000)
  }

  /**
   * Load webhook configurations
   */
  private loadConfigs() {
    // Load from localStorage or use defaults
    const stored = localStorage.getItem('webhook_configs')
    if (stored) {
      const configs = JSON.parse(stored) as WebhookConfig[]
      configs.forEach(config => {
        this.configs.set(config.id, config)
      })
    } else {
      // Set up default webhooks
      this.registerWebhook({
        id: 'default',
        name: 'Default Webhook',
        enabled: true,
        autoCreateTask: true,
        policyTrigger: POLICY_TRIGGERS.WEBHOOK_RECEIVED
      })
    }
  }

  /**
   * Save configurations
   */
  private saveConfigs() {
    const configs = Array.from(this.configs.values())
    localStorage.setItem('webhook_configs', JSON.stringify(configs))
  }

  /**
   * Register a new webhook
   */
  registerWebhook(config: WebhookConfig): string {
    this.configs.set(config.id, config)
    this.saveConfigs()
    return config.id
  }

  /**
   * Unregister webhook
   */
  unregisterWebhook(id: string): boolean {
    const deleted = this.configs.delete(id)
    if (deleted) {
      this.saveConfigs()
    }
    return deleted
  }

  /**
   * Process incoming webhook with comprehensive security checks
   */
  async receiveWebhook(
    webhookId: string,
    payload: any,
    headers: Record<string, string> = {}
  ): Promise<WebhookEvent> {
    const span = createSpan({
      name: 'webhook.receive',
      attributes: {
        webhookId,
        payloadSize: JSON.stringify(payload).length,
        ip: headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown'
      }
    })

    try {
      const config = this.configs.get(webhookId)
      if (!config) {
        span.addEvent('webhook_not_found', { webhookId })
        throw new Error(`Webhook not found: ${webhookId}`)
      }

      if (!config.enabled) {
        span.addEvent('webhook_disabled', { webhookId })
        throw new Error(`Webhook is disabled: ${webhookId}`)
      }

      // SECURITY: Rate limiting per webhook + IP
      const rateLimitKey = `${webhookId}:${headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown'}`
      const rateLimit = this.security.checkRateLimit(rateLimitKey)
      if (!rateLimit.allowed) {
        span.addEvent('rate_limit_exceeded', {
          key: rateLimitKey,
          reason: rateLimit.reason
        })
        throw new Error(rateLimit.reason || 'Rate limit exceeded')
      }
      span.setAttribute('rate_limit_remaining', rateLimit.remaining)

      // SECURITY: Payload structure validation
      if (config.provider && !this.security.validatePayloadStructure(payload, config.provider)) {
        span.addEvent('invalid_payload_structure', { provider: config.provider })
        throw new Error(`Invalid ${config.provider} webhook payload structure`)
      }

      // SECURITY: Deduplication via payload hash
      const payloadHash = await this.security.computePayloadHash(payload)
      const recentTimestamp = this.recentHashes.get(payloadHash)
      if (recentTimestamp && Date.now() - recentTimestamp < 60000) {
        span.addEvent('duplicate_webhook_rejected', { payloadHash: payloadHash.substring(0, 16) })
        throw new Error('Duplicate webhook rejected (received within last 60s)')
      }
      this.recentHashes.set(payloadHash, Date.now())

      // SECURITY: HMAC signature verification
      if (config.secret || config.requireSignature) {
        const signature = headers['x-webhook-signature'] ||
                         headers['x-hub-signature-256'] ||
                         headers['x-hub-signature'] ||
                         headers['x-telegram-bot-api-secret-token']

        if (!signature) {
          span.addEvent('missing_signature')
          throw new Error('Webhook signature required but not provided')
        }

        const timestamp = headers['x-webhook-timestamp'] || headers['x-slack-request-timestamp']
        const verification = await this.security.verifyHMAC(
          payload,
          config.secret || '',
          signature,
          timestamp
        )

        if (!verification.valid) {
          span.addEvent('signature_verification_failed', { reason: verification.reason })
          throw new Error(`Signature verification failed: ${verification.reason}`)
        }

        span.addEvent('signature_verified', {
          timestamp: verification.timestamp,
          skew: verification.timestamp ? Date.now() - verification.timestamp : 0
        })
      }

      // SECURITY: Sanitize payload to prevent injection
      const sanitizedPayload = this.security.sanitizePayload(payload)

      // Create event record
      const event: WebhookEvent = {
        id: uuidv4(),
        sensorId: webhookId,
        payload: sanitizedPayload,
        headers: this.sanitizeHeaders(headers),
        receivedAt: new Date().toISOString(),
        processed: false,
        spanId: span.getSpan().id
      }

      this.events.push(event)
      span.addEvent('webhook_received', {
        eventId: event.id,
        payloadHash: payloadHash.substring(0, 16)
      })

      // Process webhook
      await this.processWebhook(event, config, span)

      event.processed = true
      await span.end('ok')

      return event
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Sanitize headers to prevent information leakage
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {}
    const allowedHeaders = [
      'content-type',
      'user-agent',
      'x-github-delivery',
      'x-github-event',
      'x-hub-signature-256',
      'x-webhook-id',
      'x-webhook-timestamp'
    ]

    for (const key of allowedHeaders) {
      if (headers[key]) {
        sanitized[key] = headers[key]
      }
    }

    return sanitized
  }

  /**
   * Process webhook event
   */
  private async processWebhook(
    event: WebhookEvent,
    config: WebhookConfig,
    span: any
  ) {
    // Auto-create task if enabled
    if (config.autoCreateTask) {
      const taskStore = useTaskStore()
      const taskTitle = this.extractTaskTitle(event.payload)
      const taskDescription = this.extractTaskDescription(event.payload)

      await taskStore.createTask(taskTitle, {
        description: taskDescription,
        tags: ['webhook', config.name],
        origin: 'webhook',
        spanId: span.getSpan().id,
        metadata: {
          webhookId: config.id,
          eventId: event.id,
          source: event.headers['user-agent'] || 'unknown'
        }
      })

      span.addEvent('task_created_from_webhook')
    }

    // Trigger policies if configured
    if (config.policyTrigger) {
      await triggerPolicies(config.policyTrigger, {
        webhookId: config.id,
        event,
        payload: event.payload
      })

      span.addEvent('policies_triggered', { trigger: config.policyTrigger })
    }
  }

  /**
   * Extract task title from webhook payload
   */
  private extractTaskTitle(payload: any): string {
    // Try common patterns
    if (payload.title) return payload.title
    if (payload.subject) return payload.subject
    if (payload.name) return payload.name
    if (payload.message) return payload.message.substring(0, 100)

    // GitHub webhook patterns
    if (payload.action && payload.repository) {
      return `${payload.action} on ${payload.repository.name}`
    }

    // Default
    return 'Webhook event received'
  }

  /**
   * Extract task description from webhook payload
   */
  private extractTaskDescription(payload: any): string {
    if (payload.description) return payload.description
    if (payload.body) return payload.body
    if (payload.message) return payload.message

    // Fallback: stringify payload
    return JSON.stringify(payload, null, 2)
  }

  /**
   * Clear old events (TTL enforcement)
   */
  clearOldEvents(olderThanDays: number = 30) {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    const beforeCount = this.events.length
    this.events = this.events.filter(e => {
      return new Date(e.receivedAt).getTime() > cutoff
    })
    return beforeCount - this.events.length
  }

  /**
   * Cleanup old data (events, rate limits, deduplication hashes)
   */
  private cleanupOldData() {
    // Clear events older than 30 days
    this.clearOldEvents(30)

    // Clear rate limit entries
    this.security.cleanupRateLimits()

    // Clear old deduplication hashes (older than 1 hour)
    const now = Date.now()
    for (const [hash, timestamp] of this.recentHashes.entries()) {
      if (now - timestamp > 3600000) {
        this.recentHashes.delete(hash)
      }
    }
  }

  /**
   * Generate secure webhook secret
   */
  async generateWebhookSecret(): Promise<string> {
    return await this.security.generateSecret()
  }

  /**
   * Get all webhook events
   */
  getEvents(limit?: number): WebhookEvent[] {
    const sorted = [...this.events].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    )
    return limit ? sorted.slice(0, limit) : sorted
  }

  /**
   * Get events for specific webhook
   */
  getEventsByWebhook(webhookId: string, limit?: number): WebhookEvent[] {
    const filtered = this.events.filter(e => e.sensorId === webhookId)
    const sorted = filtered.sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    )
    return limit ? sorted.slice(0, limit) : sorted
  }

  /**
   * Get all webhook configurations
   */
  getWebhooks(): WebhookConfig[] {
    return Array.from(this.configs.values())
  }

  /**
   * Get webhook URL for a config
   */
  getWebhookUrl(webhookId: string): string {
    const config = this.configs.get(webhookId)
    if (!config) {
      throw new Error(`Webhook not found: ${webhookId}`)
    }

    // In a real implementation, this would be a server endpoint
    // For PWA, we'd need a companion server or use a webhook relay service
    return `${window.location.origin}/api/webhooks/${webhookId}`
  }

}

// Singleton instance
let webhookReceiverInstance: WebhookReceiver | null = null

/**
 * Get or create webhook receiver instance
 */
export function getWebhookReceiver(): WebhookReceiver {
  if (!webhookReceiverInstance) {
    webhookReceiverInstance = new WebhookReceiver()
  }
  return webhookReceiverInstance
}

/**
 * Receive webhook (convenience function)
 */
export async function receiveWebhook(
  webhookId: string,
  payload: any,
  headers?: Record<string, string>
): Promise<WebhookEvent> {
  const receiver = getWebhookReceiver()
  return await receiver.receiveWebhook(webhookId, payload, headers)
}

/**
 * Common webhook processors for popular services
 */
export const WEBHOOK_PROCESSORS = {
  github: {
    name: 'GitHub Webhook',
    extractTitle: (payload: any) => {
      if (payload.action && payload.issue) {
        return `GitHub: ${payload.action} issue #${payload.issue.number}`
      }
      if (payload.action && payload.pull_request) {
        return `GitHub: ${payload.action} PR #${payload.pull_request.number}`
      }
      return 'GitHub webhook event'
    },
    extractDescription: (payload: any) => {
      if (payload.issue) {
        return payload.issue.title + '\n\n' + (payload.issue.body || '')
      }
      if (payload.pull_request) {
        return payload.pull_request.title + '\n\n' + (payload.pull_request.body || '')
      }
      return JSON.stringify(payload, null, 2)
    }
  },

  telegram: {
    name: 'Telegram Bot',
    extractTitle: (payload: any) => {
      if (payload.message?.text) {
        return payload.message.text.substring(0, 100)
      }
      return 'Telegram message received'
    },
    extractDescription: (payload: any) => {
      return payload.message?.text || JSON.stringify(payload, null, 2)
    }
  }
}
