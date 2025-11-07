/**
 * Calendar Sensor
 *
 * Monitors calendar events and creates tasks for:
 * - Upcoming meetings
 * - Events with action items
 * - Deadlines
 * - Reminders
 */

import type { Span, Sensor } from '@/types'
import { SpanBuilder } from '@/utils/span'
import { db } from '@/utils/db'

export interface CalendarConfig {
  enabled: boolean
  refreshIntervalMinutes: number
  lookAheadDays: number // How many days to look ahead
  filters: {
    onlyWithReminders: boolean
    onlyWithActionItems: boolean
    excludeDeclined: boolean
    calendars: string[] // Calendar IDs to monitor
    keywords: string[]
  }
  autoCreateTasks: boolean
  reminderThresholds: {
    immediate: number // minutes before event
    soon: number // minutes before event
    upcoming: number // minutes before event
  }
}

const DEFAULT_CONFIG: CalendarConfig = {
  enabled: false,
  refreshIntervalMinutes: 60,
  lookAheadDays: 7,
  filters: {
    onlyWithReminders: false,
    onlyWithActionItems: false,
    excludeDeclined: true,
    calendars: [],
    keywords: ['deadline', 'review', 'submit', 'deliver']
  },
  autoCreateTasks: true,
  reminderThresholds: {
    immediate: 15, // < 15 min
    soon: 60, // < 1 hour
    upcoming: 1440 // < 24 hours
  }
}

export class CalendarSensor {
  private config: CalendarConfig
  private sensor: Sensor
  private pollingInterval: number | null = null
  private processedEvents: Set<string> = new Set()

  constructor(config: Partial<CalendarConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.sensor = {
      id: 'calendar_sensor',
      name: 'Calendar Events Monitor',
      type: 'calendar',
      config: this.config,
      enabled: this.config.enabled
    }
  }

  /**
   * Start monitoring calendar
   */
  async start(userId: string): Promise<void> {
    if (!this.config.enabled) {
      console.log('[CalendarSensor] Sensor is disabled')
      return
    }

    console.log('[CalendarSensor] Starting...')

    // Initial fetch
    await this.fetchEvents(userId)

    // Set up polling
    this.pollingInterval = window.setInterval(
      () => this.fetchEvents(userId),
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
    this.processedEvents.clear()
    console.log('[CalendarSensor] Stopped')
  }

  /**
   * Fetch calendar events
   */
  private async fetchEvents(userId: string): Promise<Span[]> {
    const spanBuilder = new SpanBuilder()
      .setName('calendar_sensor.fetch_events')
      .setKind('client')
      .setUserId(userId)
      .setAttributes({
        sensorId: this.sensor.id,
        source: 'calendar',
        lookAheadDays: this.config.lookAheadDays
      })

    try {
      // TODO: Implement actual calendar API integration (Google Calendar, Outlook, etc.)
      // For now, simulate event fetching
      const events = await this.simulateFetchEvents()

      spanBuilder.addEvent('events_fetched', {
        count: events.length
      })

      const spans: Span[] = []

      for (const event of events) {
        // Skip if already processed
        if (this.processedEvents.has(event.id)) {
          continue
        }

        if (this.shouldProcessEvent(event)) {
          const eventSpan = this.createEventSpan(event, userId)
          spans.push(eventSpan)
          await db.spans.add(eventSpan)
          this.processedEvents.add(event.id)
        }
      }

      spanBuilder.addEvent('events_processed', {
        count: spans.length
      })

      spanBuilder.setStatus('ok')
      console.log(`[CalendarSensor] Processed ${spans.length} events`)

      return spans
    } catch (error) {
      spanBuilder.setStatus('error')
      spanBuilder.addEvent('error', {
        error: error instanceof Error ? error.message : String(error)
      })
      console.error('[CalendarSensor] Error:', error)
      return []
    } finally {
      spanBuilder.end()
      await db.spans.add(spanBuilder.getSpan())
    }
  }

  /**
   * Create a span from calendar event
   */
  private createEventSpan(event: any, userId: string): Span {
    const minutesUntil = this.getMinutesUntilEvent(event)
    const urgencyLevel = this.getEventUrgency(minutesUntil)

    const tags: string[] = ['calendar', 'event']

    // Add urgency tags
    if (urgencyLevel === 'immediate') {
      tags.push('urgent', '🔥', 'immediate')
    } else if (urgencyLevel === 'soon') {
      tags.push('soon', '⚡')
    } else {
      tags.push('upcoming')
    }

    // Add action item tags
    if (this.hasActionItems(event)) {
      tags.push('action-required')
    }

    const spanBuilder = new SpanBuilder()
      .setName('calendar.event_upcoming')
      .setKind('consumer')
      .setUserId(userId)
      .setAttributes({
        sensorId: this.sensor.id,
        source: 'calendar',
        createTask: true,
        eventType: 'calendar',
        eventId: event.id,
        title: event.summary,
        description: event.description,
        location: event.location,
        eventStart: event.start.dateTime,
        eventEnd: event.end.dateTime,
        attendees: event.attendees?.map((a: any) => a.email) || [],
        organizer: event.organizer?.email,
        deadline: event.start.dateTime,
        dueDate: event.start.dateTime,
        minutesUntil,
        urgencyLevel,
        critical: urgencyLevel === 'immediate',
        tags
      })

    return spanBuilder.build()
  }

  /**
   * Check if event should be processed
   */
  private shouldProcessEvent(event: any): boolean {
    const { filters } = this.config

    // Check if event is in the future
    const eventTime = new Date(event.start.dateTime).getTime()
    const now = Date.now()
    const lookAheadMs = this.config.lookAheadDays * 24 * 60 * 60 * 1000

    if (eventTime < now || eventTime > now + lookAheadMs) {
      return false
    }

    // Check if event is declined
    if (filters.excludeDeclined && event.status === 'declined') {
      return false
    }

    // Check calendar filter
    if (filters.calendars.length > 0 && !filters.calendars.includes(event.calendarId)) {
      return false
    }

    // Check reminders filter
    if (filters.onlyWithReminders && !event.reminders?.useDefault && !event.reminders?.overrides) {
      return false
    }

    // Check action items filter
    if (filters.onlyWithActionItems && !this.hasActionItems(event)) {
      return false
    }

    // Check keywords
    if (filters.keywords.length > 0) {
      const text = `${event.summary} ${event.description || ''}`.toLowerCase()
      const matches = filters.keywords.some(keyword =>
        text.includes(keyword.toLowerCase())
      )
      if (!matches) return false
    }

    return true
  }

  /**
   * Check if event has action items
   */
  private hasActionItems(event: any): boolean {
    const actionKeywords = ['deadline', 'submit', 'deliver', 'review', 'prepare', 'complete']
    const text = `${event.summary} ${event.description || ''}`.toLowerCase()
    return actionKeywords.some(keyword => text.includes(keyword))
  }

  /**
   * Calculate minutes until event
   */
  private getMinutesUntilEvent(event: any): number {
    const eventTime = new Date(event.start.dateTime).getTime()
    const now = Date.now()
    return Math.floor((eventTime - now) / (60 * 1000))
  }

  /**
   * Determine event urgency level
   */
  private getEventUrgency(minutesUntil: number): 'immediate' | 'soon' | 'upcoming' {
    const { reminderThresholds } = this.config

    if (minutesUntil <= reminderThresholds.immediate) {
      return 'immediate'
    } else if (minutesUntil <= reminderThresholds.soon) {
      return 'soon'
    } else {
      return 'upcoming'
    }
  }

  /**
   * Simulate event fetching (for demo)
   */
  private async simulateFetchEvents(): Promise<any[]> {
    const now = new Date()

    return [
      {
        id: 'event_1',
        calendarId: 'primary',
        summary: 'Team Standup - Review Sprint Progress',
        description: 'Review sprint progress and blockers',
        location: 'Conference Room A',
        start: {
          dateTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString() // 30 min from now
        },
        end: {
          dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() // 1 hour from now
        },
        attendees: [
          { email: 'team@company.com' }
        ],
        organizer: { email: 'manager@company.com' },
        status: 'accepted',
        reminders: {
          useDefault: true
        }
      },
      {
        id: 'event_2',
        calendarId: 'primary',
        summary: 'Project Deadline - Submit Final Report',
        description: 'Final deadline to submit the quarterly report',
        start: {
          dateTime: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString() // 4 hours from now
        },
        end: {
          dateTime: new Date(now.getTime() + 4.5 * 60 * 60 * 1000).toISOString()
        },
        status: 'accepted',
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 }
          ]
        }
      },
      {
        id: 'event_3',
        calendarId: 'primary',
        summary: 'Client Presentation',
        description: 'Present Q4 results to client',
        location: 'Zoom',
        start: {
          dateTime: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() // Tomorrow
        },
        end: {
          dateTime: new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()
        },
        attendees: [
          { email: 'client@example.com' }
        ],
        status: 'accepted'
      }
    ]
  }

  /**
   * Get sensor status
   */
  getStatus() {
    return {
      ...this.sensor,
      isRunning: this.pollingInterval !== null,
      processedEvents: this.processedEvents.size
    }
  }
}

/**
 * Create and start Calendar sensor
 */
export async function createCalendarSensor(
  config?: Partial<CalendarConfig>,
  userId?: string
): Promise<CalendarSensor> {
  const sensor = new CalendarSensor(config)

  if (userId && config?.enabled) {
    await sensor.start(userId)
  }

  return sensor
}
