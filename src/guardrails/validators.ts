import type { Span, SpanValidationResult } from '@/types'

/**
 * span_validation - Checagem mínima antes de executar spans
 *
 * Checks: ["hasCode", "timestampValid", "validOwner"]
 * fail_fast: true
 */

/**
 * Validate span before execution
 */
export function validateSpan(span: Span): SpanValidationResult {
  const errors: string[] = []
  const checks: SpanValidationResult['checks'] = {}

  // Check 1: Has code (for run_code spans)
  if (span.name.includes('run_code')) {
    const hasCode = span.attributes?.code !== undefined && span.attributes?.code !== ''
    checks.hasCode = hasCode
    if (!hasCode) {
      errors.push('Span marked as run_code but has no code attribute')
    }
  }

  // Check 2: Timestamp valid
  const timestampValid = validateTimestamp(span)
  checks.timestampValid = timestampValid
  if (!timestampValid) {
    errors.push('Span has invalid timestamp')
  }

  // Check 3: Valid owner
  const validOwner = validateOwner(span)
  checks.validOwner = validOwner
  if (!validOwner) {
    errors.push('Span has invalid or missing owner (userId)')
  }

  // Check 4: Valid trace ID
  if (!span.traceId || span.traceId.trim() === '') {
    errors.push('Span has invalid or missing traceId')
  }

  // Check 5: Valid span ID
  if (!span.id || span.id.trim() === '') {
    errors.push('Span has invalid or missing id')
  }

  // Check 6: Valid status
  const validStatuses = ['ok', 'error', 'pending']
  if (!validStatuses.includes(span.status)) {
    errors.push(`Span has invalid status: ${span.status}`)
  }

  // Check 7: Valid kind
  const validKinds = ['internal', 'server', 'client', 'producer', 'consumer']
  if (!validKinds.includes(span.kind)) {
    errors.push(`Span has invalid kind: ${span.kind}`)
  }

  // Check 8: Start time exists
  if (!span.startTime) {
    errors.push('Span missing startTime')
  }

  // Check 9: If status is not pending, should have endTime
  if (span.status !== 'pending' && !span.endTime) {
    errors.push(`Span has status ${span.status} but no endTime`)
  }

  // Check 10: endTime should be after startTime
  if (span.endTime) {
    const start = new Date(span.startTime).getTime()
    const end = new Date(span.endTime).getTime()
    if (end < start) {
      errors.push('Span endTime is before startTime')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    checks
  }
}

/**
 * Validate timestamp
 */
function validateTimestamp(span: Span): boolean {
  try {
    const startTime = new Date(span.startTime).getTime()
    if (isNaN(startTime)) return false

    // Check if timestamp is reasonable (not in the future, not too old)
    const now = Date.now()
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000
    const oneHourFromNow = now + 60 * 60 * 1000

    if (startTime < oneYearAgo || startTime > oneHourFromNow) {
      return false
    }

    if (span.endTime) {
      const endTime = new Date(span.endTime).getTime()
      if (isNaN(endTime)) return false
      if (endTime < oneYearAgo || endTime > oneHourFromNow) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

/**
 * Validate owner
 */
function validateOwner(span: Span): boolean {
  if (!span.userId) return false
  if (span.userId.trim() === '') return false

  // Check if userId is a valid format (UUID or similar)
  // Basic check: should be at least 8 characters
  if (span.userId.length < 8) return false

  return true
}

/**
 * Validate span attributes
 */
export function validateSpanAttributes(attributes: Record<string, any>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Check for forbidden attributes
  const forbiddenKeys = ['__proto__', 'constructor', 'prototype']
  for (const key of forbiddenKeys) {
    if (key in attributes) {
      errors.push(`Forbidden attribute key: ${key}`)
    }
  }

  // Check attribute size
  const attributesString = JSON.stringify(attributes)
  if (attributesString.length > 100000) {
    // 100KB
    errors.push(`Attributes size exceeds maximum (${attributesString.length} > 100000)`)
  }

  // Check for deeply nested objects (prevent stack overflow)
  if (getMaxDepth(attributes) > 10) {
    errors.push('Attributes are too deeply nested (max depth: 10)')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Get max depth of object
 */
function getMaxDepth(obj: any, currentDepth: number = 0): number {
  if (typeof obj !== 'object' || obj === null) {
    return currentDepth
  }

  let maxDepth = currentDepth
  for (const value of Object.values(obj)) {
    const depth = getMaxDepth(value, currentDepth + 1)
    if (depth > maxDepth) {
      maxDepth = depth
    }
  }

  return maxDepth
}

/**
 * Validate span events
 */
export function validateSpanEvents(events: Array<any>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Check event count
  if (events.length > 1000) {
    errors.push(`Too many events (${events.length} > 1000)`)
  }

  // Validate each event
  for (const [index, event] of events.entries()) {
    if (!event.name) {
      errors.push(`Event ${index} missing name`)
    }
    if (!event.timestamp) {
      errors.push(`Event ${index} missing timestamp`)
    }
    if (event.attributes) {
      const attrValidation = validateSpanAttributes(event.attributes)
      if (!attrValidation.valid) {
        errors.push(`Event ${index} has invalid attributes: ${attrValidation.errors.join(', ')}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Comprehensive span validation
 */
export function validateSpanComprehensive(span: Span): SpanValidationResult {
  const basicValidation = validateSpan(span)

  if (!basicValidation.valid) {
    return basicValidation
  }

  // Additional validations
  const errors = [...basicValidation.errors]

  // Validate attributes
  if (span.attributes) {
    const attrValidation = validateSpanAttributes(span.attributes)
    if (!attrValidation.valid) {
      errors.push(...attrValidation.errors)
    }
  }

  // Validate events
  if (span.events && span.events.length > 0) {
    const eventValidation = validateSpanEvents(span.events)
    if (!eventValidation.valid) {
      errors.push(...eventValidation.errors)
    }
  }

  // Validate hash
  if (span.hash && span.hash.length !== 64) {
    // Assuming SHA-256 hash (64 hex chars)
    errors.push('Span hash is not a valid SHA-256 hash')
  }

  return {
    valid: errors.length === 0,
    errors,
    checks: basicValidation.checks
  }
}

/**
 * Batch validate spans
 */
export function validateSpanBatch(spans: Span[]): {
  valid: boolean
  results: Array<{ span: Span; validation: SpanValidationResult }>
  summary: {
    total: number
    valid: number
    invalid: number
  }
} {
  const results = spans.map((span) => ({
    span,
    validation: validateSpan(span)
  }))

  const validCount = results.filter((r) => r.validation.valid).length

  return {
    valid: validCount === spans.length,
    results,
    summary: {
      total: spans.length,
      valid: validCount,
      invalid: spans.length - validCount
    }
  }
}
