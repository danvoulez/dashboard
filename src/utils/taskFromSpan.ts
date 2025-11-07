/**
 * Task From Span Transformer
 *
 * Converts spans into tasks with intelligent inference:
 * - Infer title from span.message or tags
 * - Detect critical = true if tags include 🔥/error
 * - Extract dueDate if span.deadline || calendar_event
 * - Preserve traceId, source, createdAt, userId
 */

import { v4 as uuidv4 } from 'uuid'
import type { Span, Task, TaskFromSpanConfig } from '@/types'
import { computeUrgency } from './urgencyPolicy'

/**
 * Default configuration for task creation
 */
const DEFAULT_CONFIG: TaskFromSpanConfig = {
  inferTitle: true,
  detectCritical: true,
  extractDueDate: true,
  preserveTrace: true
}

/**
 * Extract title from span
 */
function inferTitle(span: Span): string {
  // 1. Check attributes.title
  if (span.attributes.title) {
    return String(span.attributes.title)
  }

  // 2. Check attributes.message
  if (span.attributes.message) {
    return String(span.attributes.message)
  }

  // 3. Use span.name
  if (span.name && span.name !== 'unknown') {
    return span.name
  }

  // 4. Try to construct from tags
  const tags = extractTags(span)
  if (tags.length > 0) {
    const actionTag = tags.find(t =>
      t.startsWith('action:') ||
      t.startsWith('type:')
    )
    if (actionTag) {
      return actionTag.split(':')[1].replace(/_/g, ' ')
    }
  }

  // 5. Default to span kind
  return `${span.kind} operation`
}

/**
 * Extract tags from span
 */
function extractTags(span: Span): string[] {
  const tags: string[] = []

  // From attributes.tags (array)
  if (Array.isArray(span.attributes.tags)) {
    tags.push(...span.attributes.tags.map(String))
  }

  // From attributes.tag (single)
  if (span.attributes.tag) {
    tags.push(String(span.attributes.tag))
  }

  // From span events
  for (const event of span.events) {
    if (event.attributes.tag) {
      tags.push(String(event.attributes.tag))
    }
  }

  // Infer from span.kind
  tags.push(`kind:${span.kind}`)

  // Infer from status
  if (span.status === 'error') {
    tags.push('error')
  }

  return [...new Set(tags)] // Remove duplicates
}

/**
 * Detect if task is critical based on tags or status
 */
function detectCritical(span: Span, tags: string[]): boolean {
  // Check for critical indicators in tags
  const criticalTags = ['🔥', 'fire', 'critical', 'urgent', 'emergency', 'error', 'failure']
  const hasCriticalTag = tags.some(tag =>
    criticalTags.some(ct => tag.toLowerCase().includes(ct))
  )

  // Check span status
  const isError = span.status === 'error'

  // Check attributes
  const isCriticalAttr = span.attributes.critical === true ||
                         span.attributes.urgent === true

  return hasCriticalTag || isError || isCriticalAttr
}

/**
 * Extract due date from span
 */
function extractDueDate(span: Span): string | undefined {
  // 1. Check attributes.deadline
  if (span.attributes.deadline) {
    return new Date(span.attributes.deadline).toISOString()
  }

  // 2. Check attributes.dueDate
  if (span.attributes.dueDate) {
    return new Date(span.attributes.dueDate).toISOString()
  }

  // 3. Check for calendar event
  if (span.attributes.eventType === 'calendar' && span.attributes.eventStart) {
    return new Date(span.attributes.eventStart).toISOString()
  }

  // 4. Check attributes.scheduledFor
  if (span.attributes.scheduledFor) {
    return new Date(span.attributes.scheduledFor).toISOString()
  }

  // 5. Check span events for deadline
  for (const event of span.events) {
    if (event.name === 'deadline_set' && event.attributes.deadline) {
      return new Date(event.attributes.deadline).toISOString()
    }
  }

  return undefined
}

/**
 * Extract description from span
 */
function extractDescription(span: Span): string | undefined {
  if (span.attributes.description) {
    return String(span.attributes.description)
  }

  if (span.attributes.details) {
    return String(span.attributes.details)
  }

  // Construct from events
  if (span.events.length > 0) {
    const eventSummary = span.events
      .map(e => `${e.name}: ${JSON.stringify(e.attributes)}`)
      .join('\n')
    return eventSummary
  }

  return undefined
}

/**
 * Determine task origin from span
 */
function determineOrigin(span: Span): Task['origin'] {
  const source = span.attributes.source || span.attributes.origin

  if (source === 'webhook') return 'webhook'
  if (source === 'llm') return 'llm'
  if (source === 'cron') return 'cron'
  if (source === 'upload' || source === 'file') return 'upload'
  if (source === 'plugin') return 'plugin'
  if (source === 'gdrive') return 'gdrive'

  // Default to span
  return 'span'
}

/**
 * Convert a Span to a Task
 */
export function taskFromSpan(
  span: Span,
  config: Partial<TaskFromSpanConfig> = {}
): Task {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }

  // Extract basic information
  const tags = extractTags(span)
  const title = fullConfig.inferTitle ? inferTitle(span) : span.name
  const critical = fullConfig.detectCritical ? detectCritical(span, tags) : false
  const dueDate = fullConfig.extractDueDate ? extractDueDate(span) : undefined
  const description = extractDescription(span)
  const origin = determineOrigin(span)

  // Create task
  const now = new Date().toISOString()
  const task: Task = {
    id: uuidv4(),
    title,
    description,
    tags,
    origin,
    status: 'pending',
    userId: span.userId,
    source: span.attributes.sensorId || span.attributes.source || 'unknown',
    priority: 50, // Default, will be computed
    urgency: 0, // Will be computed
    deadline: dueDate,
    dueDate,
    spanId: fullConfig.preserveTrace ? span.id : undefined,
    metadata: {
      traceId: fullConfig.preserveTrace ? span.traceId : undefined,
      parentSpanId: span.parentSpanId,
      spanKind: span.kind,
      spanStatus: span.status,
      spanStartTime: span.startTime,
      spanEndTime: span.endTime,
      originalAttributes: { ...span.attributes }
    },
    resolved: false,
    critical,
    createdAt: span.startTime || now,
    updatedAt: now
  }

  // Compute urgency
  const urgencyResult = computeUrgency(task)
  task.urgency = urgencyResult.urgency

  return task
}

/**
 * Batch convert spans to tasks
 */
export function batchTaskFromSpan(
  spans: Span[],
  config: Partial<TaskFromSpanConfig> = {}
): Task[] {
  return spans.map(span => taskFromSpan(span, config))
}

/**
 * Check if a span should generate a task
 */
export function shouldCreateTask(span: Span): boolean {
  // Skip if explicitly disabled
  if (span.attributes.skipTaskCreation === true) {
    return false
  }

  // Skip if span is internal and not marked as task-worthy
  if (span.kind === 'internal' && !span.attributes.createTask) {
    return false
  }

  // Skip if span is still pending (wait for completion)
  if (span.status === 'pending') {
    return false
  }

  // Create task if:
  // 1. Span has explicit task flag
  if (span.attributes.createTask === true) {
    return true
  }

  // 2. Span is from a sensor
  if (span.attributes.sensorId || span.attributes.source === 'sensor') {
    return true
  }

  // 3. Span has deadline/dueDate
  if (span.attributes.deadline || span.attributes.dueDate) {
    return true
  }

  // 4. Span is an error
  if (span.status === 'error') {
    return true
  }

  // 5. Span is from webhook
  if (span.attributes.source === 'webhook') {
    return true
  }

  // 6. Span is marked as critical
  if (span.attributes.critical === true || span.attributes.urgent === true) {
    return true
  }

  return false
}

/**
 * Update existing task from new span data
 */
export function updateTaskFromSpan(
  task: Task,
  span: Span
): Task {
  const tags = extractTags(span)
  const critical = detectCritical(span, tags)
  const dueDate = extractDueDate(span)

  const updatedTask: Task = {
    ...task,
    tags: [...new Set([...task.tags, ...tags])],
    critical: task.critical || critical,
    dueDate: dueDate || task.dueDate,
    deadline: dueDate || task.deadline,
    metadata: {
      ...task.metadata,
      lastSpanUpdate: span.id,
      lastUpdateTime: span.startTime
    },
    updatedAt: new Date().toISOString()
  }

  // Recalculate urgency
  const urgencyResult = computeUrgency(updatedTask)
  updatedTask.urgency = urgencyResult.urgency

  return updatedTask
}
