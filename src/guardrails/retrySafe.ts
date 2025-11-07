import { createSpan } from '@/utils/span'
import type { RetryConfig, ExecutionResult } from '@/types'
import { wrapSafe } from './wrapSafe'

/**
 * retrySafe - Reexecução com backoff exponencial e limitação de tentativas
 *
 * Behavior:
 * - max_attempts: 3
 * - interval_ms: [1000, 3000, 7000]
 * - span_mark: "retried"
 */

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  intervals: [1000, 3000, 7000]
}

/**
 * Execute operation with retry logic
 */
export async function retrySafe<T = any>(
  operation: () => Promise<T>,
  options: {
    origin: string
    config?: Partial<RetryConfig>
    spanName?: string
    metadata?: Record<string, any>
  }
): Promise<ExecutionResult<T>> {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...options.config
  }

  const span = createSpan({
    name: options.spanName || `retrySafe.${options.origin}`,
    attributes: {
      origin: options.origin,
      maxAttempts: config.maxAttempts,
      ...options.metadata
    }
  })

  let lastError: Error | unknown
  let attempt = 0

  for (attempt = 0; attempt < config.maxAttempts; attempt++) {
    span.addEvent('retry_attempt', {
      attempt: attempt + 1,
      maxAttempts: config.maxAttempts,
      timestamp: new Date().toISOString()
    })

    const result = await wrapSafe(operation, {
      origin: options.origin,
      retryable: true,
      spanName: `${options.spanName || options.origin}.attempt_${attempt + 1}`,
      metadata: {
        ...options.metadata,
        retryAttempt: attempt + 1,
        maxAttempts: config.maxAttempts
      }
    })

    if (result.success) {
      span.addEvent('retry_success', {
        attempt: attempt + 1,
        timestamp: new Date().toISOString()
      })

      span.setAttribute('retried', attempt > 0)
      span.setAttribute('totalAttempts', attempt + 1)
      await span.end('ok')

      return result
    }

    lastError = new Error(result.error || 'Unknown error')

    // Check if error is retryable
    if (!result.retryable) {
      span.addEvent('retry_aborted_not_retryable', {
        attempt: attempt + 1,
        error: result.error
      })
      break
    }

    // Check if we should retry based on error type
    if (config.retryableErrors && result.errorCode) {
      if (!config.retryableErrors.includes(result.errorCode)) {
        span.addEvent('retry_aborted_error_not_retryable', {
          attempt: attempt + 1,
          errorCode: result.errorCode
        })
        break
      }
    }

    // Call onRetry callback if provided
    if (config.onRetry) {
      config.onRetry(attempt + 1, lastError instanceof Error ? lastError : new Error(String(lastError)))
    }

    // Wait before next retry (if not last attempt)
    if (attempt < config.maxAttempts - 1) {
      const waitTime = config.intervals[Math.min(attempt, config.intervals.length - 1)]

      span.addEvent('retry_wait', {
        attempt: attempt + 1,
        waitTimeMs: waitTime
      })

      await sleep(waitTime)
    }
  }

  // All retries failed
  span.addEvent('retry_failed', {
    totalAttempts: attempt,
    finalError: lastError instanceof Error ? lastError.message : String(lastError)
  })

  span.setAttribute('retried', true)
  span.setAttribute('totalAttempts', attempt)
  span.setAttribute('allRetriesFailed', true)
  await span.end('error', lastError instanceof Error ? lastError.message : String(lastError))

  return {
    success: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    retryable: false,
    traceId: span.getSpan().traceId,
    origin: options.origin,
    timestamp: new Date().toISOString(),
    metadata: {
      ...options.metadata,
      totalAttempts: attempt,
      allRetriesFailed: true
    }
  }
}

/**
 * Retry a failed error record
 */
export async function retryErrorRecord<T = any>(
  errorId: string,
  operation: () => Promise<T>,
  origin: string
): Promise<ExecutionResult<T>> {
  const { getErrorByTraceId, updateErrorStatus } = await import('./error_queue')

  const span = createSpan({
    name: `retrySafe.retry_error_record`,
    attributes: {
      errorId,
      origin
    }
  })

  try {
    span.addEvent('retry_error_start', { errorId })

    const result = await retrySafe(operation, { origin })

    if (result.success) {
      await updateErrorStatus(errorId, 'resolved')
      span.addEvent('retry_error_resolved', { errorId })
    } else {
      await updateErrorStatus(errorId, 'failed')
      span.addEvent('retry_error_failed', { errorId })
    }

    await span.end('ok')
    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    span.addEvent('retry_error_exception', { error: errorMessage })
    await span.end('error', errorMessage)
    throw error
  }
}

/**
 * Retry all retryable errors
 */
export async function retryAllRetryableErrors(
  operationFactory: (errorRecord: any) => Promise<any>
): Promise<{
  total: number
  resolved: number
  failed: number
}> {
  const { getRetryableErrors } = await import('./error_queue')

  const retryableErrors = await getRetryableErrors()

  let resolved = 0
  let failed = 0

  for (const error of retryableErrors) {
    try {
      const operation = () => operationFactory(error)
      const result = await retryErrorRecord(error.id, operation, error.origin)

      if (result.success) {
        resolved++
      } else {
        failed++
      }
    } catch (e) {
      failed++
    }
  }

  return {
    total: retryableErrors.length,
    resolved,
    failed
  }
}

/**
 * Helper: sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
