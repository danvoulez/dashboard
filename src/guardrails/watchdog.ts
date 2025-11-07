import { createSpan } from '@/utils/span'
import { getSpans } from '@/utils/db'
import type { Span, WatchdogConfig } from '@/types'
import { saveErrorRecord } from './error_queue'

/**
 * watchdog - Agente que detecta spans travados ou executando por tempo excessivo
 *
 * Behavior:
 * - interval_minutes: 5
 * - actions: ["marcar como erro", "emitir nova tentativa", "gerar log crítico"]
 */

const DEFAULT_WATCHDOG_CONFIG: WatchdogConfig = {
  checkIntervalMinutes: 5,
  stuckThresholdMinutes: 30,
  actions: ['mark_error', 'log_critical']
}

export class Watchdog {
  private config: WatchdogConfig
  private interval: NodeJS.Timeout | null = null
  private isRunning = false

  constructor(config?: Partial<WatchdogConfig>) {
    this.config = {
      ...DEFAULT_WATCHDOG_CONFIG,
      ...config
    }
  }

  /**
   * Start watchdog
   */
  start() {
    if (this.isRunning) {
      console.warn('Watchdog already running')
      return
    }

    this.isRunning = true
    console.log(`Watchdog started - checking every ${this.config.checkIntervalMinutes} minutes`)

    const intervalMs = this.config.checkIntervalMinutes * 60 * 1000

    this.interval = setInterval(async () => {
      await this.check()
    }, intervalMs)

    // Run immediately on start
    this.check()
  }

  /**
   * Stop watchdog
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.isRunning = false
    console.log('Watchdog stopped')
  }

  /**
   * Check for stuck spans
   */
  async check() {
    const span = createSpan({
      name: 'watchdog.check',
      attributes: {
        checkIntervalMinutes: this.config.checkIntervalMinutes,
        stuckThresholdMinutes: this.config.stuckThresholdMinutes
      }
    })

    try {
      const spans = await getSpans()
      const now = Date.now()
      const thresholdMs = this.config.stuckThresholdMinutes * 60 * 1000

      let stuckCount = 0
      let longRunningCount = 0

      for (const targetSpan of spans) {
        // Check for stuck spans (pending status for too long)
        if (targetSpan.status === 'pending') {
          const startTime = new Date(targetSpan.startTime).getTime()
          const elapsed = now - startTime

          if (elapsed > thresholdMs) {
            stuckCount++
            await this.handleStuckSpan(targetSpan, elapsed)
          }
        }

        // Check for long-running spans (completed but took too long)
        if (targetSpan.status === 'ok' && targetSpan.endTime) {
          const startTime = new Date(targetSpan.startTime).getTime()
          const endTime = new Date(targetSpan.endTime).getTime()
          const duration = endTime - startTime

          if (duration > thresholdMs) {
            longRunningCount++
            await this.handleLongRunningSpan(targetSpan, duration)
          }
        }
      }

      span.addEvent('watchdog_check_complete', {
        totalSpans: spans.length,
        stuckSpans: stuckCount,
        longRunningSpans: longRunningCount
      })

      span.setAttribute('stuckSpans', stuckCount)
      span.setAttribute('longRunningSpans', longRunningCount)

      await span.end('ok')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      span.addEvent('watchdog_check_error', { error: errorMessage })
      await span.end('error', errorMessage)
    }
  }

  /**
   * Handle stuck span
   */
  private async handleStuckSpan(span: Span, elapsedMs: number) {
    const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000))

    console.warn(`Watchdog detected stuck span: ${span.name} (${elapsedMinutes} minutes)`)

    for (const action of this.config.actions) {
      switch (action) {
        case 'mark_error':
          await this.markSpanAsError(span, `Span stuck for ${elapsedMinutes} minutes`)
          break

        case 'emit_retry':
          await this.emitRetry(span)
          break

        case 'log_critical':
          await this.logCritical(span, `Stuck for ${elapsedMinutes} minutes`, elapsedMs)
          break
      }
    }
  }

  /**
   * Handle long-running span
   */
  private async handleLongRunningSpan(span: Span, durationMs: number) {
    const durationMinutes = Math.floor(durationMs / (60 * 1000))

    console.warn(`Watchdog detected long-running span: ${span.name} (${durationMinutes} minutes)`)

    for (const action of this.config.actions) {
      switch (action) {
        case 'log_critical':
          await this.logCritical(
            span,
            `Completed but took ${durationMinutes} minutes`,
            durationMs
          )
          break
      }
    }
  }

  /**
   * Mark span as error in database
   */
  private async markSpanAsError(span: Span, reason: string) {
    // Note: In a real implementation, you'd update the span in the database
    // For now, we'll just create an error record
    await saveErrorRecord({
      traceId: span.traceId,
      errorMessage: `Span marked as error by watchdog: ${reason}`,
      origin: 'watchdog',
      retryable: true,
      spanId: span.id,
      metadata: {
        spanName: span.name,
        reason,
        watchdogAction: 'mark_error'
      }
    })
  }

  /**
   * Emit retry for span
   */
  private async emitRetry(span: Span) {
    await saveErrorRecord({
      traceId: span.traceId,
      errorMessage: `Watchdog recommends retry for stuck span: ${span.name}`,
      origin: 'watchdog',
      retryable: true,
      spanId: span.id,
      metadata: {
        spanName: span.name,
        watchdogAction: 'emit_retry',
        suggestedAction: 'retry'
      }
    })
  }

  /**
   * Log critical error
   */
  private async logCritical(span: Span, message: string, duration: number) {
    const logSpan = createSpan({
      name: 'watchdog.critical_log',
      attributes: {
        severity: 'critical',
        targetSpanId: span.id,
        targetSpanName: span.name,
        message,
        durationMs: duration
      }
    })

    logSpan.addEvent('critical_log', {
      spanId: span.id,
      spanName: span.name,
      message,
      durationMs: duration
    })

    await logSpan.end('ok')

    // Also save to error queue
    await saveErrorRecord({
      traceId: span.traceId,
      errorMessage: `CRITICAL: ${message} - Span: ${span.name}`,
      origin: 'watchdog',
      retryable: false,
      spanId: span.id,
      metadata: {
        severity: 'critical',
        spanName: span.name,
        durationMs: duration,
        watchdogAction: 'log_critical'
      }
    })
  }

  /**
   * Get watchdog status
   */
  getStatus() {
    return {
      running: this.isRunning,
      config: this.config
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WatchdogConfig>) {
    this.config = {
      ...this.config,
      ...config
    }

    // Restart if running
    if (this.isRunning) {
      this.stop()
      this.start()
    }
  }
}

// Singleton instance
let watchdogInstance: Watchdog | null = null

/**
 * Get or create watchdog instance
 */
export function getWatchdog(config?: Partial<WatchdogConfig>): Watchdog {
  if (!watchdogInstance) {
    watchdogInstance = new Watchdog(config)
  }
  return watchdogInstance
}

/**
 * Start watchdog
 */
export function startWatchdog(config?: Partial<WatchdogConfig>) {
  const watchdog = getWatchdog(config)
  watchdog.start()
  return watchdog
}

/**
 * Stop watchdog
 */
export function stopWatchdog() {
  if (watchdogInstance) {
    watchdogInstance.stop()
  }
}
