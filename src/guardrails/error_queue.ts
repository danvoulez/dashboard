import { openDB, type IDBPDatabase } from 'idb'
import type { ErrorRecord } from '@/types'
import { v4 as uuidv4 } from 'uuid'

/**
 * errorStore - Armazenamento local de erros rastreáveis com retry manual e visualização
 *
 * Fields: traceId, errorMessage, origin, retryable
 * UI component: ErrorDashboard.vue
 */

const DB_NAME = 'radar-dashboard'
const ERROR_STORE = 'errors'

/**
 * Save error record to IndexedDB
 */
export async function saveErrorRecord(errorData: {
  traceId: string
  errorMessage: string
  errorStack?: string
  origin: string
  retryable: boolean
  spanId?: string
  metadata?: Record<string, any>
}): Promise<ErrorRecord> {
  const db = await openDB(DB_NAME)

  const existingError = await getErrorByTraceId(errorData.traceId)

  if (existingError) {
    // Update existing error
    const updatedError: ErrorRecord = {
      ...existingError,
      retryCount: existingError.retryCount + 1,
      lastOccurrence: new Date().toISOString(),
      status: existingError.retryCount + 1 >= existingError.maxRetries ? 'failed' : 'retrying',
      metadata: {
        ...existingError.metadata,
        ...errorData.metadata
      }
    }

    await db.put(ERROR_STORE, updatedError)
    return updatedError
  } else {
    // Create new error record
    const newError: ErrorRecord = {
      id: uuidv4(),
      traceId: errorData.traceId,
      errorMessage: errorData.errorMessage,
      errorStack: errorData.errorStack,
      origin: errorData.origin,
      retryable: errorData.retryable,
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
      firstOccurrence: new Date().toISOString(),
      lastOccurrence: new Date().toISOString(),
      spanId: errorData.spanId,
      metadata: errorData.metadata
    }

    await db.add(ERROR_STORE, newError)
    return newError
  }
}

/**
 * Get error by trace ID
 */
export async function getErrorByTraceId(traceId: string): Promise<ErrorRecord | undefined> {
  const db = await openDB(DB_NAME)
  const errors = await db.getAll(ERROR_STORE)
  return errors.find((e) => e.traceId === traceId)
}

/**
 * Get all error records
 */
export async function getAllErrors(): Promise<ErrorRecord[]> {
  const db = await openDB(DB_NAME)
  return await db.getAll(ERROR_STORE)
}

/**
 * Get errors by status
 */
export async function getErrorsByStatus(
  status: ErrorRecord['status']
): Promise<ErrorRecord[]> {
  const db = await openDB(DB_NAME)
  const errors = await db.getAll(ERROR_STORE)
  return errors.filter((e) => e.status === status)
}

/**
 * Get retryable errors
 */
export async function getRetryableErrors(): Promise<ErrorRecord[]> {
  const db = await openDB(DB_NAME)
  const errors = await db.getAll(ERROR_STORE)
  return errors.filter((e) => e.retryable && e.status !== 'resolved' && e.retryCount < e.maxRetries)
}

/**
 * Update error status
 */
export async function updateErrorStatus(
  errorId: string,
  status: ErrorRecord['status']
): Promise<void> {
  const db = await openDB(DB_NAME)
  const error = await db.get(ERROR_STORE, errorId)

  if (error) {
    error.status = status
    error.lastOccurrence = new Date().toISOString()
    await db.put(ERROR_STORE, error)
  }
}

/**
 * Mark error as resolved
 */
export async function resolveError(errorId: string): Promise<void> {
  await updateErrorStatus(errorId, 'resolved')
}

/**
 * Delete error record
 */
export async function deleteError(errorId: string): Promise<void> {
  const db = await openDB(DB_NAME)
  await db.delete(ERROR_STORE, errorId)
}

/**
 * Clear all errors
 */
export async function clearAllErrors(): Promise<void> {
  const db = await openDB(DB_NAME)
  await db.clear(ERROR_STORE)
}

/**
 * Get error statistics
 */
export async function getErrorStats(): Promise<{
  total: number
  pending: number
  retrying: number
  failed: number
  resolved: number
  retryable: number
}> {
  const errors = await getAllErrors()

  return {
    total: errors.length,
    pending: errors.filter((e) => e.status === 'pending').length,
    retrying: errors.filter((e) => e.status === 'retrying').length,
    failed: errors.filter((e) => e.status === 'failed').length,
    resolved: errors.filter((e) => e.status === 'resolved').length,
    retryable: errors.filter((e) => e.retryable).length
  }
}

/**
 * Get errors by origin
 */
export async function getErrorsByOrigin(origin: string): Promise<ErrorRecord[]> {
  const db = await openDB(DB_NAME)
  const errors = await db.getAll(ERROR_STORE)
  return errors.filter((e) => e.origin === origin)
}

/**
 * Cleanup old resolved errors (older than 30 days)
 */
export async function cleanupOldErrors(): Promise<number> {
  const db = await openDB(DB_NAME)
  const errors = await db.getAll(ERROR_STORE)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  let deletedCount = 0

  for (const error of errors) {
    if (
      error.status === 'resolved' &&
      new Date(error.lastOccurrence).getTime() < thirtyDaysAgo
    ) {
      await db.delete(ERROR_STORE, error.id)
      deletedCount++
    }
  }

  return deletedCount
}
