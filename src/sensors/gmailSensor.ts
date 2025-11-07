/**
 * Gmail Sensor
 *
 * Monitors Gmail inbox and creates spans/tasks for:
 * - Important emails
 * - Starred emails
 * - Emails with deadlines in subject/body
 * - Emails from specific senders
 */

import type { Span, Sensor } from '@/types'
import { SpanBuilder } from '@/utils/span'
import { db } from '@/utils/db'

export interface GmailConfig {
  enabled: boolean
  apiKey?: string
  refreshIntervalMinutes: number
  filters: {
    onlyStarred: boolean
    onlyImportant: boolean
    fromSenders: string[]
    keywords: string[]
  }
  autoCreateTasks: boolean
}

const DEFAULT_CONFIG: GmailConfig = {
  enabled: false,
  refreshIntervalMinutes: 15,
  filters: {
    onlyStarred: false,
    onlyImportant: true,
    fromSenders: [],
    keywords: ['urgent', 'asap', 'deadline', 'important']
  },
  autoCreateTasks: true
}

export class GmailSensor {
  private config: GmailConfig
  private sensor: Sensor
  private pollingInterval: number | null = null

  constructor(config: Partial<GmailConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.sensor = {
      id: 'gmail_sensor',
      name: 'Gmail Inbox Monitor',
      type: 'gmail',
      config: this.config,
      enabled: this.config.enabled
    }
  }

  /**
   * Start monitoring Gmail
   */
  async start(userId: string): Promise<void> {
    if (!this.config.enabled) {
      console.log('[GmailSensor] Sensor is disabled')
      return
    }

    console.log('[GmailSensor] Starting...')

    // Initial fetch
    await this.fetchEmails(userId)

    // Set up polling
    this.pollingInterval = window.setInterval(
      () => this.fetchEmails(userId),
      this.config.refreshIntervalMinutes * 60 * 1000
    )

    this.sensor.lastRun = new Date().toISOString()
    this.sensor.nextRun = new Date(
      Date.now() + this.config.refreshIntervalMinutes * 60 * 1000
    ).toISOString()
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
    console.log('[GmailSensor] Stopped')
  }

  /**
   * Fetch emails from Gmail API
   */
  private async fetchEmails(userId: string): Promise<Span[]> {
    const span = new SpanBuilder()
      .setName('gmail_sensor.fetch_emails')
      .setKind('client')
      .setUserId(userId)
      .setAttributes({
        sensorId: this.sensor.id,
        source: 'gmail'
      })
      .build()

    try {
      // TODO: Implement actual Gmail API integration
      // For now, simulate email fetching
      const emails = await this.simulateFetchEmails()

      span.addEvent('emails_fetched', {
        count: emails.length
      })

      const spans: Span[] = []

      for (const email of emails) {
        if (this.shouldProcessEmail(email)) {
          const emailSpan = this.createEmailSpan(email, userId)
          spans.push(emailSpan)
          await db.spans.add(emailSpan)
        }
      }

      span.addEvent('emails_processed', {
        count: spans.length
      })

      span.setStatus('ok')
      console.log(`[GmailSensor] Processed ${spans.length} emails`)

      return spans
    } catch (error) {
      span.setStatus('error')
      span.addEvent('error', {
        error: error instanceof Error ? error.message : String(error)
      })
      console.error('[GmailSensor] Error:', error)
      return []
    } finally {
      span.end()
      await db.spans.add(span)
    }
  }

  /**
   * Create a span from email data
   */
  private createEmailSpan(email: any, userId: string): Span {
    const span = new SpanBuilder()
      .setName('gmail.email_received')
      .setKind('consumer')
      .setUserId(userId)
      .setAttributes({
        sensorId: this.sensor.id,
        source: 'gmail',
        createTask: true,
        emailId: email.id,
        from: email.from,
        subject: email.subject,
        snippet: email.snippet,
        starred: email.starred,
        important: email.important,
        deadline: this.extractDeadline(email)
      })
      .build()

    // Add tags based on email properties
    const tags: string[] = ['email', 'gmail']
    if (email.starred) tags.push('starred')
    if (email.important) tags.push('important')
    if (this.hasUrgentKeyword(email)) tags.push('urgent', '🔥')

    span.attributes.tags = tags

    return span
  }

  /**
   * Check if email should be processed
   */
  private shouldProcessEmail(email: any): boolean {
    const { filters } = this.config

    // Check starred filter
    if (filters.onlyStarred && !email.starred) {
      return false
    }

    // Check important filter
    if (filters.onlyImportant && !email.important) {
      return false
    }

    // Check sender filter
    if (filters.fromSenders.length > 0) {
      const matches = filters.fromSenders.some(sender =>
        email.from.toLowerCase().includes(sender.toLowerCase())
      )
      if (!matches) return false
    }

    // Check keyword filter
    if (filters.keywords.length > 0) {
      const text = `${email.subject} ${email.snippet}`.toLowerCase()
      const matches = filters.keywords.some(keyword =>
        text.includes(keyword.toLowerCase())
      )
      if (!matches) return false
    }

    return true
  }

  /**
   * Check if email has urgent keywords
   */
  private hasUrgentKeyword(email: any): boolean {
    const urgentKeywords = ['urgent', 'asap', 'immediately', 'critical', 'emergency']
    const text = `${email.subject} ${email.snippet}`.toLowerCase()
    return urgentKeywords.some(keyword => text.includes(keyword))
  }

  /**
   * Extract deadline from email content
   */
  private extractDeadline(email: any): string | undefined {
    // Simple deadline extraction (can be enhanced with NLP)
    const text = `${email.subject} ${email.snippet}`
    const patterns = [
      /deadline[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /due[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /by[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        try {
          return new Date(match[1]).toISOString()
        } catch {
          continue
        }
      }
    }

    return undefined
  }

  /**
   * Simulate email fetching (for demo purposes)
   */
  private async simulateFetchEmails(): Promise<any[]> {
    // Simulated emails for demonstration
    return [
      {
        id: 'email_1',
        from: 'boss@company.com',
        subject: 'URGENT: Project deadline moved to tomorrow',
        snippet: 'We need to deliver the project by EOD tomorrow...',
        starred: true,
        important: true,
        receivedAt: new Date().toISOString()
      },
      {
        id: 'email_2',
        from: 'client@example.com',
        subject: 'Question about deliverables',
        snippet: 'Can you clarify the scope of work?',
        starred: false,
        important: true,
        receivedAt: new Date().toISOString()
      }
    ]
  }

  /**
   * Get sensor status
   */
  getStatus() {
    return {
      ...this.sensor,
      isRunning: this.pollingInterval !== null
    }
  }
}

/**
 * Create and start Gmail sensor
 */
export async function createGmailSensor(
  config?: Partial<GmailConfig>,
  userId?: string
): Promise<GmailSensor> {
  const sensor = new GmailSensor(config)

  if (userId && config?.enabled) {
    await sensor.start(userId)
  }

  return sensor
}
