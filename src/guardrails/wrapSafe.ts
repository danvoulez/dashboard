import { createSpan, type SpanBuilder } from '@/utils/span'
import type { ExecutionResult } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { saveErrorRecord } from './error_queue'

/**
 * wrapSafe - Função padrão de proteção computável para qualquer execução crítica
 *
 * Behavior:
 * - try/catch automático
 * - log de erro em span
 * - tagging de origem
 * - retryable flag
 * - Output: Promise<ExecutionResult>
 */
export async function wrapSafe<T = any>(
  operation: () => Promise<T>,
  options: {
    origin: string
    retryable?: boolean
    spanName?: string
    metadata?: Record<string, any>
  }
): Promise<ExecutionResult<T>> {
  const traceId = uuidv4()
  const timestamp = new Date().toISOString()
  const startTime = Date.now()

  const span = createSpan({
    name: options.spanName || `wrapSafe.${options.origin}`,
    attributes: {
      origin: options.origin,
      retryable: options.retryable ?? true,
      traceId,
      ...options.metadata
    }
  })

  try {
    span.addEvent('execution_start', { timestamp })

    const data = await operation()

    const duration = Date.now() - startTime

    span.addEvent('execution_success', {
      duration,
      timestamp: new Date().toISOString()
    })

    span.setAttribute('duration', duration)
    await span.end('ok')

    return {
      success: true,
      data,
      retryable: false,
      traceId,
      origin: options.origin,
      timestamp,
      duration,
      metadata: options.metadata
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    span.addEvent('execution_error', {
      error: errorMessage,
      errorStack,
      duration,
      timestamp: new Date().toISOString()
    })

    span.setAttribute('error', errorMessage)
    span.setAttribute('duration', duration)
    span.setAttribute('retryable', options.retryable ?? true)
    await span.end('error', errorMessage)

    // Save to error store
    await saveErrorRecord({
      traceId,
      errorMessage,
      errorStack,
      origin: options.origin,
      retryable: options.retryable ?? true,
      spanId: span.getSpan().id,
      metadata: options.metadata
    })

    return {
      success: false,
      error: errorMessage,
      errorCode: error instanceof Error && 'code' in error ? (error as any).code : undefined,
      retryable: options.retryable ?? true,
      traceId,
      origin: options.origin,
      timestamp,
      duration,
      metadata: options.metadata
    }
  }
}

/**
 * wrapSafeSync - Versão síncrona do wrapSafe
 */
export function wrapSafeSync<T = any>(
  operation: () => T,
  options: {
    origin: string
    retryable?: boolean
    spanName?: string
    metadata?: Record<string, any>
  }
): ExecutionResult<T> {
  const traceId = uuidv4()
  const timestamp = new Date().toISOString()
  const startTime = Date.now()

  try {
    const data = operation()
    const duration = Date.now() - startTime

    return {
      success: true,
      data,
      retryable: false,
      traceId,
      origin: options.origin,
      timestamp,
      duration,
      metadata: options.metadata
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      error: errorMessage,
      errorCode: error instanceof Error && 'code' in error ? (error as any).code : undefined,
      retryable: options.retryable ?? true,
      traceId,
      origin: options.origin,
      timestamp,
      duration,
      metadata: options.metadata
    }
  }
}

/**
 * wrapSafeWithSpan - Wrapper que aceita span existente
 */
export async function wrapSafeWithSpan<T = any>(
  operation: () => Promise<T>,
  span: SpanBuilder,
  options: {
    origin: string
    retryable?: boolean
    metadata?: Record<string, any>
  }
): Promise<ExecutionResult<T>> {
  const traceId = span.getSpan().traceId
  const timestamp = new Date().toISOString()
  const startTime = Date.now()

  span.setAttribute('origin', options.origin)
  span.setAttribute('retryable', options.retryable ?? true)

  try {
    span.addEvent('wrapSafe_start', { timestamp })

    const data = await operation()

    const duration = Date.now() - startTime

    span.addEvent('wrapSafe_success', {
      duration,
      timestamp: new Date().toISOString()
    })

    span.setAttribute('duration', duration)

    return {
      success: true,
      data,
      retryable: false,
      traceId,
      origin: options.origin,
      timestamp,
      duration,
      metadata: options.metadata
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    span.addEvent('wrapSafe_error', {
      error: errorMessage,
      duration,
      timestamp: new Date().toISOString()
    })

    span.setAttribute('error', errorMessage)
    span.setAttribute('duration', duration)

    // Save to error store
    await saveErrorRecord({
      traceId,
      errorMessage,
      errorStack,
      origin: options.origin,
      retryable: options.retryable ?? true,
      spanId: span.getSpan().id,
      metadata: options.metadata
    })

    return {
      success: false,
      error: errorMessage,
      errorCode: error instanceof Error && 'code' in error ? (error as any).code : undefined,
      retryable: options.retryable ?? true,
      traceId,
      origin: options.origin,
      timestamp,
      duration,
      metadata: options.metadata
    }
  }
}
