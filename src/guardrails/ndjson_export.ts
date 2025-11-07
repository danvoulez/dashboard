import { getSpans } from '@/utils/db'
import type { Span, ErrorRecord } from '@/types'
import { getAllErrors } from './error_queue'

/**
 * ndjson_exporter - Exportação segura de logs e spans para auditoria externa
 *
 * Filters: ["errored", "running_long", "span_type='run_code'"]
 */

export interface NDJSONExportOptions {
  filters?: {
    status?: 'ok' | 'error' | 'pending'
    spanName?: string
    spanNamePattern?: RegExp
    minDuration?: number // milliseconds
    maxDuration?: number // milliseconds
    startDate?: Date
    endDate?: Date
    includeAttributes?: boolean
    includeEvents?: boolean
  }
  limit?: number
  offset?: number
}

/**
 * Export spans as NDJSON
 */
export async function exportSpansAsNDJSON(
  options: NDJSONExportOptions = {}
): Promise<string> {
  const spans = await getSpans()

  let filtered = spans

  // Apply filters
  if (options.filters) {
    const { status, spanName, spanNamePattern, minDuration, maxDuration, startDate, endDate } =
      options.filters

    if (status) {
      filtered = filtered.filter((s) => s.status === status)
    }

    if (spanName) {
      filtered = filtered.filter((s) => s.name === spanName)
    }

    if (spanNamePattern) {
      filtered = filtered.filter((s) => spanNamePattern.test(s.name))
    }

    if (minDuration !== undefined || maxDuration !== undefined) {
      filtered = filtered.filter((s) => {
        if (!s.endTime) return false
        const duration = new Date(s.endTime).getTime() - new Date(s.startTime).getTime()
        if (minDuration !== undefined && duration < minDuration) return false
        if (maxDuration !== undefined && duration > maxDuration) return false
        return true
      })
    }

    if (startDate) {
      filtered = filtered.filter((s) => new Date(s.startTime) >= startDate)
    }

    if (endDate) {
      filtered = filtered.filter((s) => new Date(s.startTime) <= endDate)
    }
  }

  // Apply pagination
  if (options.offset) {
    filtered = filtered.slice(options.offset)
  }

  if (options.limit) {
    filtered = filtered.slice(0, options.limit)
  }

  // Convert to NDJSON
  const lines = filtered.map((span) => {
    const exportSpan: any = {
      id: span.id,
      traceId: span.traceId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: span.kind,
      startTime: span.startTime,
      endTime: span.endTime,
      status: span.status,
      userId: span.userId
    }

    if (options.filters?.includeAttributes !== false) {
      exportSpan.attributes = span.attributes
    }

    if (options.filters?.includeEvents !== false) {
      exportSpan.events = span.events
    }

    return JSON.stringify(exportSpan)
  })

  return lines.join('\n')
}

/**
 * Export errors as NDJSON
 */
export async function exportErrorsAsNDJSON(
  options: {
    status?: ErrorRecord['status']
    origin?: string
    retryableOnly?: boolean
    startDate?: Date
    endDate?: Date
  } = {}
): Promise<string> {
  const errors = await getAllErrors()

  let filtered = errors

  // Apply filters
  if (options.status) {
    filtered = filtered.filter((e) => e.status === options.status)
  }

  if (options.origin) {
    filtered = filtered.filter((e) => e.origin === options.origin)
  }

  if (options.retryableOnly) {
    filtered = filtered.filter((e) => e.retryable)
  }

  if (options.startDate) {
    filtered = filtered.filter((e) => new Date(e.firstOccurrence) >= options.startDate!)
  }

  if (options.endDate) {
    filtered = filtered.filter((e) => new Date(e.firstOccurrence) <= options.endDate!)
  }

  // Convert to NDJSON
  const lines = filtered.map((error) => JSON.stringify(error))

  return lines.join('\n')
}

/**
 * Export errored spans as NDJSON
 */
export async function exportErroredSpans(options?: NDJSONExportOptions): Promise<string> {
  return exportSpansAsNDJSON({
    ...options,
    filters: {
      ...options?.filters,
      status: 'error'
    }
  })
}

/**
 * Export long-running spans as NDJSON
 */
export async function exportLongRunningSpans(
  minDurationMinutes: number = 5,
  options?: NDJSONExportOptions
): Promise<string> {
  return exportSpansAsNDJSON({
    ...options,
    filters: {
      ...options?.filters,
      minDuration: minDurationMinutes * 60 * 1000
    }
  })
}

/**
 * Export run_code spans as NDJSON
 */
export async function exportRunCodeSpans(options?: NDJSONExportOptions): Promise<string> {
  return exportSpansAsNDJSON({
    ...options,
    filters: {
      ...options?.filters,
      spanNamePattern: /run_code/
    }
  })
}

/**
 * Export all data for compliance
 */
export async function exportCompliance(
  startDate: Date,
  endDate: Date
): Promise<{
  spans: string
  errors: string
  metadata: {
    exportedAt: string
    startDate: string
    endDate: string
    spanCount: number
    errorCount: number
  }
}> {
  const spansNDJSON = await exportSpansAsNDJSON({
    filters: {
      startDate,
      endDate,
      includeAttributes: true,
      includeEvents: true
    }
  })

  const errorsNDJSON = await exportErrorsAsNDJSON({
    startDate,
    endDate
  })

  const spanCount = spansNDJSON.split('\n').filter((line) => line.trim()).length
  const errorCount = errorsNDJSON.split('\n').filter((line) => line.trim()).length

  return {
    spans: spansNDJSON,
    errors: errorsNDJSON,
    metadata: {
      exportedAt: new Date().toISOString(),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      spanCount,
      errorCount
    }
  }
}

/**
 * Download NDJSON as file
 */
export function downloadNDJSON(ndjson: string, filename: string = 'export.ndjson') {
  const blob = new Blob([ndjson], { type: 'application/x-ndjson' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Parse NDJSON string to array of objects
 */
export function parseNDJSON<T = any>(ndjson: string): T[] {
  return ndjson
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

/**
 * Create audit report
 */
export async function createAuditReport(
  startDate: Date,
  endDate: Date
): Promise<{
  summary: {
    totalSpans: number
    errorSpans: number
    pendingSpans: number
    totalErrors: number
    retryableErrors: number
    failedErrors: number
  }
  export: {
    spans: string
    errors: string
  }
}> {
  const compliance = await exportCompliance(startDate, endDate)

  const spans = parseNDJSON<Span>(compliance.spans)
  const errors = parseNDJSON<ErrorRecord>(compliance.errors)

  return {
    summary: {
      totalSpans: spans.length,
      errorSpans: spans.filter((s) => s.status === 'error').length,
      pendingSpans: spans.filter((s) => s.status === 'pending').length,
      totalErrors: errors.length,
      retryableErrors: errors.filter((e) => e.retryable).length,
      failedErrors: errors.filter((e) => e.status === 'failed').length
    },
    export: {
      spans: compliance.spans,
      errors: compliance.errors
    }
  }
}
