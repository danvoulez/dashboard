// Core Types for Radar Dashboard

// User & Authentication
export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  provider: 'google' | 'github' | 'telegram'
  logLineId: string
  createdAt: string
}

export interface AuthSession {
  user: User
  token: string
  expiresAt: string
}

// Task Management
export type TaskStatus = 'pending' | 'in_progress' | 'done'
export type TaskOrigin = 'plugin' | 'upload' | 'span' | 'manual' | 'webhook' | 'llm' | 'cron' | 'gdrive' | 'policy' | 'sensor'

export interface Task {
  id: string
  title: string
  description?: string
  tags: string[]
  origin: TaskOrigin
  status: TaskStatus
  assignedTo?: string
  userId: string // Required: task owner
  source?: string // Sensor ID that created the task
  priority: number // 0-100, computed by formula
  urgency: number // 0-100, computed by urgency policy
  deadline?: string // ISO timestamp
  dueDate?: string // Alias for deadline (ISO timestamp)
  spanId?: string
  metadata?: Record<string, any>
  resolved: boolean // Quick check for task completion
  critical: boolean // Emergency flag (🔥/error tags)
  createdAt: string
  updatedAt: string
}

export interface TaskPriorityFactors {
  weight: number
  daysToDeadline: number
  daysInactive: number
}

// Task System - Urgency Policy
export interface UrgencyRule {
  condition: (task: Task) => boolean
  urgency: number
  description: string
}

export interface UrgencyPolicyResult {
  urgency: number
  matchedRule: string
  critical: boolean
}

// Task creation from Span
export interface TaskFromSpanConfig {
  inferTitle: boolean
  detectCritical: boolean
  extractDueDate: boolean
  preserveTrace: boolean
}

// Span Protocol (LogLine)
export interface Span {
  id: string
  traceId: string
  parentSpanId?: string
  name: string
  kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer'
  startTime: string
  endTime?: string
  status: 'ok' | 'error' | 'pending'
  attributes: Record<string, any>
  events: SpanEvent[]
  signature?: string // DV25Seal
  hash: string // BLAKE3
  userId: string
}

export interface SpanEvent {
  name: string
  timestamp: string
  attributes: Record<string, any>
}

// Plugin System
export type PluginPermission = 'view' | 'edit' | 'delete'

export interface PluginMetadata {
  id: string
  title: string
  description?: string
  icon: string
  route: string
  permissions: PluginPermission[]
  enabled: boolean
}

export interface ServiceModule {
  metadata: PluginMetadata
  component: any // Vue component
  config: any
  store?: any
  onInit?: () => Promise<void>
  onSpan?: (span: Span) => Promise<void>
}

// LLM Integration
export type LLMProvider = 'openai' | 'macmind' | 'ollama'

export interface LLMConfig {
  provider: LLMProvider
  apiKey?: string
  endpoint?: string
  model: string
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMCallOptions {
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json' | 'text'
  schema?: any
}

export interface LLMCallResult {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  model: string
}

export interface LLMRequest {
  module: LLMModule
  prompt: string
  input: any
  schema?: any
  context?: Record<string, any>
}

export interface LLMResponse {
  result: any
  spanId: string
  hash: string
  timestamp: string
}

export type LLMModule =
  | 'classify_tasks'
  | 'summarize_state'
  | 'generate_task_from_input'
  | 'plan_next_steps'
  | 'explain_span'
  | 'generate_policy'
  | 'task_summarizer'
  | 'urgency_analyzer'
  | 'task_editor'

// Policy & Automation
export interface Policy {
  id: string
  name: string
  description: string
  enabled: boolean
  trigger: string // e.g., "file.uploaded"
  condition: string // JavaScript expression
  action: string // JavaScript code
  naturalLanguageInput?: string
  createdAt: string
  updatedAt: string
  createdBy: string
  spanIds: string[] // execution history
}

export interface PolicyExecution {
  policyId: string
  spanId: string
  success: boolean
  error?: string
  timestamp: string
}

// File Management
export interface FileMetadata {
  id: string
  name: string
  type: string
  size: number
  uploadedAt: string
  uploadedBy: string
  taskId?: string
  spanId: string
  indexed: boolean
  metadata: Record<string, any>
}

export interface FileStorage {
  id: string
  data: Blob
}

// Sensors & Webhooks
export interface Sensor {
  id: string
  name: string
  type: 'webhook' | 'polling' | 'cron' | 'gmail' | 'telegram' | 'calendar' | 'github' | 'drive'
  config: Record<string, any>
  enabled: boolean
  lastRun?: string
  nextRun?: string
}

export interface WebhookEvent {
  id: string
  sensorId: string
  payload: any
  headers: Record<string, string>
  receivedAt: string
  processed: boolean
  spanId?: string
}

// Timeline
export interface TimelineEntry {
  id: string
  type: 'span' | 'task' | 'focus' | 'upload' | 'policy'
  title: string
  description?: string
  timestamp: string
  userId: string
  metadata: Record<string, any>
  spanId?: string
}

// Focus Tracking
export interface FocusSession {
  id: string
  taskId?: string
  pluginId?: string
  startTime: string
  endTime?: string
  duration?: number // seconds
  spanId: string
}

// Dashboard State
export interface DashboardState {
  activeFocus?: FocusSession
  lastSync?: string
  dailyProgress: {
    tasksCompleted: number
    focusTime: number // seconds
    spansExecuted: number
  }
}

// Governance & RLS
export interface TenantContext {
  tenantId: string
  userId: string
  permissions: string[]
}

// Export formats
export interface NDJSONExport {
  type: 'tasks' | 'spans' | 'policies' | 'timeline'
  version: string
  exportedAt: string
  data: any[]
}

// Safety Guardrails
export interface ExecutionResult<T = any> {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
  retryable: boolean
  traceId: string
  origin: string
  timestamp: string
  duration?: number
  metadata?: Record<string, any>
}

export interface GuardrailViolation {
  id: string
  type: 'code_validation' | 'rate_limit' | 'resource_limit' | 'llm_safety' | 'webhook_security' | 'policy_validation'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  origin: string
  traceId: string
  spanId?: string
  timestamp: string
  metadata?: Record<string, any>
}

export interface ErrorRecord {
  id: string
  traceId: string
  errorMessage: string
  errorStack?: string
  origin: string
  retryable: boolean
  retryCount: number
  maxRetries: number
  status: 'pending' | 'retrying' | 'failed' | 'resolved'
  firstOccurrence: string
  lastOccurrence: string
  spanId?: string
  metadata?: Record<string, any>
}

export interface RetryConfig {
  maxAttempts: number
  intervals: number[] // milliseconds [1000, 3000, 7000]
  retryableErrors?: string[]
  onRetry?: (attempt: number, error: Error) => void
}

export interface WatchdogConfig {
  checkIntervalMinutes: number
  stuckThresholdMinutes: number
  actions: ('mark_error' | 'emit_retry' | 'log_critical')[]
}

export interface CodeGuardrailsConfig {
  blockedGlobals: string[]
  allowedUtils: string[]
  maxCodeSize: number
  enableSignatureVerification: boolean
}

export interface LLMSafetyConfig {
  enablePromptInjectionDetection: boolean
  enableSchemaValidation: boolean
  fallbackOnError: boolean
  maxRetries: number
}

export interface SpanValidationResult {
  valid: boolean
  errors: string[]
  checks: {
    hasCode?: boolean
    timestampValid?: boolean
    validOwner?: boolean
  }
}
