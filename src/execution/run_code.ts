import { createSpan } from '@/utils/span'
import type { Span } from '@/types'
import { useTaskStore } from '@/stores/tasks'
import { useUploadStore } from '@/stores/uploads'
import { useLLMStore } from '@/stores/llm'
import { validateCode as validateCodeGuardrails, createSafeContext } from '@/guardrails/code_guardrails'

export interface CodeExecutionResult {
  success: boolean
  result?: any
  error?: string
  duration: number
  spanId: string
}

export interface CodeExecutionContext {
  // Stores
  taskStore: ReturnType<typeof useTaskStore>
  uploadStore: ReturnType<typeof useUploadStore>
  llmStore: ReturnType<typeof useLLMStore>

  // Utilities
  createTask: (title: string, options?: any) => Promise<any>
  updateTask: (id: string, updates: any) => Promise<void>
  getTasks: () => any[]
  log: (message: string, data?: any) => void

  // Data passed to execution
  input?: any
  params?: Record<string, any>
}

/**
 * Execute arbitrary code in a sandboxed context
 */
export async function runCode(
  code: string,
  options: {
    input?: any
    params?: Record<string, any>
    timeout?: number
    spanId?: string
  } = {}
): Promise<CodeExecutionResult> {
  const span = createSpan({
    name: 'run_code.execute',
    attributes: {
      codeLength: code.length,
      hasInput: !!options.input,
      parentSpanId: options.spanId
    }
  })

  const startTime = Date.now()

  try {
    // Validate code using guardrails
    const validation = validateCodeGuardrails(code, {
      origin: 'run_code.execute',
      traceId: span.getSpan().traceId,
      spanId: span.getSpan().id
    })

    if (!validation.valid) {
      span.addEvent('code_validation_failed', {
        violations: validation.violations.length,
        errors: validation.errors
      })

      span.setAttribute('guardrail_violations', validation.violations.length)
      await span.end('error', `Code validation failed: ${validation.errors[0]}`)

      return {
        success: false,
        error: `Code validation failed: ${validation.errors.join(', ')}`,
        duration: Date.now() - startTime,
        spanId: span.getSpan().id
      }
    }

    if (validation.warnings.length > 0) {
      span.addEvent('code_validation_warnings', {
        warnings: validation.warnings
      })
    }

    span.addEvent('code_validation_passed')

    // Build execution context
    const taskStore = useTaskStore()
    const uploadStore = useUploadStore()
    const llmStore = useLLMStore()

    const logs: Array<{ message: string; data?: any; timestamp: string }> = []

    const context: CodeExecutionContext = {
      taskStore,
      uploadStore,
      llmStore,
      input: options.input,
      params: options.params || {},

      createTask: async (title: string, opts?: any) => {
        return await taskStore.createTask(title, opts)
      },

      updateTask: async (id: string, updates: any) => {
        await taskStore.updateTask(id, updates)
      },

      getTasks: () => {
        return taskStore.tasks
      },

      log: (message: string, data?: any) => {
        const logEntry = {
          message,
          data,
          timestamp: new Date().toISOString()
        }
        logs.push(logEntry)
        span.addEvent('code_log', logEntry)
      }
    }

    span.addEvent('execution_start')
    span.setAttribute('guardrails_enabled', true)
    span.setAttribute('code_validated', true)

    // Create safe execution context (limited scope)
    const safeCtx = createSafeContext(context)

    // Create function from code (removed 'with' statement for security)
    const codeFunction = new Function('ctx', `
      "use strict";
      return (async () => {
        const { createTask, updateTask, getTasks, log, input, params } = ctx;
        ${code}
      })()
    `)

    // Execute with timeout
    const timeoutMs = options.timeout || 30000
    span.setAttribute('timeout_ms', timeoutMs)

    const result = await executeWithTimeout(
      codeFunction(safeCtx),
      timeoutMs
    )

    const duration = Date.now() - startTime

    span.addEvent('execution_complete', {
      duration,
      resultType: typeof result,
      logCount: logs.length
    })

    span.setAttribute('logs', logs)
    await span.end('ok')

    return {
      success: true,
      result,
      duration,
      spanId: span.getSpan().id
    }
  } catch (error) {
    const duration = Date.now() - startTime

    span.addEvent('execution_error', {
      error: error instanceof Error ? error.message : String(error),
      duration
    })

    await span.end('error', error instanceof Error ? error.message : String(error))

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
      spanId: span.getSpan().id
    }
  }
}

/**
 * Execute code from a span
 */
export async function runCodeFromSpan(
  spanId: string,
  code: string,
  options?: { input?: any; params?: Record<string, any> }
): Promise<CodeExecutionResult> {
  return await runCode(code, {
    ...options,
    spanId
  })
}

/**
 * Execute a predefined script
 */
export async function runScript(
  scriptName: string,
  input?: any
): Promise<CodeExecutionResult> {
  const script = PREDEFINED_SCRIPTS[scriptName]

  if (!script) {
    throw new Error(`Script not found: ${scriptName}`)
  }

  return await runCode(script.code, { input })
}

/**
 * Helper to execute promise with timeout
 */
function executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ])
}

/**
 * Validate code safety (basic checks)
 */
export function validateCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check for dangerous patterns
  const dangerousPatterns = [
    /eval\(/,
    /Function\(/,
    /import\s+/,
    /require\(/,
    /process\./,
    /global\./,
    /window\.location/,
    /document\.cookie/
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      errors.push(`Potentially dangerous pattern detected: ${pattern.source}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Predefined utility scripts
 */
export const PREDEFINED_SCRIPTS: Record<string, { name: string; description: string; code: string }> = {
  prioritize_tasks: {
    name: 'Prioritize Tasks',
    description: 'Recalculate all task priorities',
    code: `
      const tasks = getTasks()
      log('Recalculating priorities for ' + tasks.length + ' tasks')

      for (const task of tasks) {
        if (task.status !== 'done') {
          // Simple priority calculation
          let priority = 50

          if (task.deadline) {
            const daysUntil = Math.floor((new Date(task.deadline) - Date.now()) / (1000 * 60 * 60 * 24))
            if (daysUntil < 3) priority += 30
            else if (daysUntil < 7) priority += 20
            else if (daysUntil < 14) priority += 10
          }

          if (task.tags.includes('urgent')) priority += 20
          if (task.tags.includes('important')) priority += 15

          await updateTask(task.id, { priority })
        }
      }

      log('Priority update complete')
      return { updated: tasks.filter(t => t.status !== 'done').length }
    `
  },

  create_daily_summary: {
    name: 'Daily Summary',
    description: 'Create summary task of daily activities',
    code: `
      const tasks = getTasks()
      const completed = tasks.filter(t => t.status === 'done')
      const pending = tasks.filter(t => t.status === 'pending')

      const summary = \`Daily Summary:
      - Completed: \${completed.length} tasks
      - Pending: \${pending.length} tasks
      - Urgent: \${pending.filter(t => t.priority > 70).length} tasks
      \`

      await createTask('Daily Summary - ' + new Date().toLocaleDateString(), {
        description: summary,
        tags: ['summary', 'auto-generated'],
        origin: 'llm'
      })

      return { summary, completed: completed.length, pending: pending.length }
    `
  },

  cleanup_completed: {
    name: 'Archive Completed Tasks',
    description: 'Move old completed tasks to archive',
    code: `
      const tasks = getTasks()
      const completed = tasks.filter(t => t.status === 'done')
      const oldTasks = completed.filter(t => {
        const age = Date.now() - new Date(t.updatedAt).getTime()
        return age > 30 * 24 * 60 * 60 * 1000 // 30 days
      })

      log('Found ' + oldTasks.length + ' old completed tasks')

      for (const task of oldTasks) {
        await updateTask(task.id, {
          tags: [...task.tags, 'archived']
        })
      }

      return { archived: oldTasks.length }
    `
  }
}

/**
 * Get list of available scripts
 */
export function getAvailableScripts(): Array<{ name: string; description: string }> {
  return Object.entries(PREDEFINED_SCRIPTS).map(([key, script]) => ({
    name: key,
    description: script.description
  }))
}
