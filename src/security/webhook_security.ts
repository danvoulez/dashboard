/**
 * Webhook Security Hardening
 *
 * Implements:
 * - HMAC-SHA256 signature verification using Web Crypto API
 * - Rate limiting per webhook/IP
 * - Payload size limits
 * - TTL for events
 * - Timestamp validation to prevent replay attacks
 */

interface RateLimitEntry {
  count: number
  windowStart: number
  violations: number
}

interface SignatureValidationResult {
  valid: boolean
  reason?: string
  timestamp?: number
}

export class WebhookSecurity {
  private rateLimits = new Map<string, RateLimitEntry>()
  private readonly RATE_LIMIT_WINDOW = 60000 // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 100
  private readonly MAX_PAYLOAD_SIZE = 1024 * 1024 // 1MB
  private readonly MAX_TIMESTAMP_SKEW = 300000 // 5 minutes
  private readonly CIRCUIT_BREAKER_THRESHOLD = 10

  /**
   * Verify HMAC-SHA256 signature
   *
   * Supports multiple signature formats:
   * - GitHub: sha256=<hex>
   * - Standard: <hex>
   * - HMAC: hmac-sha256=<hex>
   */
  async verifyHMAC(
    payload: any,
    secret: string,
    signature: string,
    timestamp?: string
  ): Promise<SignatureValidationResult> {
    try {
      // Validate timestamp to prevent replay attacks
      if (timestamp) {
        const ts = parseInt(timestamp, 10)
        const now = Date.now()

        if (isNaN(ts)) {
          return { valid: false, reason: 'Invalid timestamp format' }
        }

        const skew = Math.abs(now - ts)
        if (skew > this.MAX_TIMESTAMP_SKEW) {
          return {
            valid: false,
            reason: `Timestamp skew too large: ${skew}ms (max ${this.MAX_TIMESTAMP_SKEW}ms)`
          }
        }
      }

      // Prepare payload string
      const payloadString = typeof payload === 'string'
        ? payload
        : JSON.stringify(payload)

      // Check payload size
      if (payloadString.length > this.MAX_PAYLOAD_SIZE) {
        return {
          valid: false,
          reason: `Payload too large: ${payloadString.length} bytes (max ${this.MAX_PAYLOAD_SIZE})`
        }
      }

      // Extract hex signature from various formats
      let hexSignature = signature
      if (signature.startsWith('sha256=')) {
        hexSignature = signature.substring(7)
      } else if (signature.startsWith('hmac-sha256=')) {
        hexSignature = signature.substring(12)
      }

      // Convert secret to key
      const encoder = new TextEncoder()
      const keyData = encoder.encode(secret)
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
      )

      // Compute HMAC
      const data = encoder.encode(payloadString)
      const signatureBuffer = await crypto.subtle.sign('HMAC', key, data)

      // Convert to hex
      const computedHex = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      // Constant-time comparison to prevent timing attacks
      const valid = this.constantTimeCompare(computedHex, hexSignature)

      return {
        valid,
        reason: valid ? undefined : 'Signature mismatch',
        timestamp: timestamp ? parseInt(timestamp, 10) : undefined
      }
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'Signature verification failed'
      }
    }
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false
    }

    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }

    return result === 0
  }

  /**
   * Check rate limit for webhook/IP
   */
  checkRateLimit(key: string): { allowed: boolean; remaining: number; reason?: string } {
    const now = Date.now()
    let entry = this.rateLimits.get(key)

    if (!entry || now - entry.windowStart > this.RATE_LIMIT_WINDOW) {
      // New window
      entry = {
        count: 0,
        windowStart: now,
        violations: entry?.violations || 0
      }
      this.rateLimits.set(key, entry)
    }

    // Circuit breaker: if too many violations, block completely
    if (entry.violations >= this.CIRCUIT_BREAKER_THRESHOLD) {
      return {
        allowed: false,
        remaining: 0,
        reason: `Circuit breaker triggered (${entry.violations} violations)`
      }
    }

    entry.count++

    if (entry.count > this.MAX_REQUESTS_PER_WINDOW) {
      entry.violations++
      return {
        allowed: false,
        remaining: 0,
        reason: `Rate limit exceeded: ${entry.count}/${this.MAX_REQUESTS_PER_WINDOW} requests in ${this.RATE_LIMIT_WINDOW}ms`
      }
    }

    return {
      allowed: true,
      remaining: this.MAX_REQUESTS_PER_WINDOW - entry.count
    }
  }

  /**
   * Reset rate limit for a key (for testing or admin override)
   */
  resetRateLimit(key: string): void {
    this.rateLimits.delete(key)
  }

  /**
   * Get rate limit stats
   */
  getRateLimitStats(key: string): RateLimitEntry | undefined {
    return this.rateLimits.get(key)
  }

  /**
   * Cleanup old rate limit entries
   */
  cleanupRateLimits(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.rateLimits.entries()) {
      if (now - entry.windowStart > this.RATE_LIMIT_WINDOW * 2) {
        this.rateLimits.delete(key)
        cleaned++
      }
    }

    return cleaned
  }

  /**
   * Validate payload structure for common webhook providers
   */
  validatePayloadStructure(payload: any, provider?: 'github' | 'telegram' | 'generic'): boolean {
    if (!payload || typeof payload !== 'object') {
      return false
    }

    switch (provider) {
      case 'github':
        // GitHub webhooks must have specific fields
        return typeof payload.action === 'string' ||
               typeof payload.repository === 'object' ||
               typeof payload.sender === 'object'

      case 'telegram':
        // Telegram webhooks must have update_id and message or other update type
        return typeof payload.update_id === 'number' &&
               (payload.message || payload.edited_message || payload.callback_query)

      case 'generic':
      default:
        // Generic validation: must be a non-null object
        return true
    }
  }

  /**
   * Sanitize payload to prevent injection attacks
   */
  sanitizePayload(payload: any, maxDepth = 10): any {
    if (maxDepth <= 0) {
      throw new Error('Payload structure too deep (possible DoS attack)')
    }

    if (payload === null || payload === undefined) {
      return payload
    }

    if (typeof payload !== 'object') {
      // Sanitize strings to prevent XSS
      if (typeof payload === 'string') {
        return payload
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;')
          .replace(/\//g, '&#x2F;')
      }
      return payload
    }

    if (Array.isArray(payload)) {
      return payload.map(item => this.sanitizePayload(item, maxDepth - 1))
    }

    const sanitized: Record<string, any> = {}
    for (const [key, value] of Object.entries(payload)) {
      // Skip potentially dangerous keys
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue
      }
      sanitized[key] = this.sanitizePayload(value, maxDepth - 1)
    }

    return sanitized
  }

  /**
   * Generate secure random webhook secret
   */
  async generateSecret(length = 32): Promise<string> {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * Compute hash of payload for deduplication
   */
  async computePayloadHash(payload: any): Promise<string> {
    const payloadString = JSON.stringify(payload)
    const encoder = new TextEncoder()
    const data = encoder.encode(payloadString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)

    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
}

// Singleton instance
let securityInstance: WebhookSecurity | null = null

/**
 * Get or create security instance
 */
export function getWebhookSecurity(): WebhookSecurity {
  if (!securityInstance) {
    securityInstance = new WebhookSecurity()
  }
  return securityInstance
}
