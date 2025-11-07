import type { LLMSafetyConfig, GuardrailViolation } from '@/types'
import type { LLMCallOptions, LLMCallResult } from '@/llm-agent/client'
import { v4 as uuidv4 } from 'uuid'
import { createSpan } from '@/utils/span'
import { retrySafe } from './retrySafe'

/**
 * llm_safety - Validação de resposta LLM com safeParse + schema
 *
 * Behavior:
 * - fallback_on_error: true
 * - retry_count: 1
 * - span_tag: "llm_output_flagged"
 */

const DEFAULT_LLM_SAFETY_CONFIG: LLMSafetyConfig = {
  enablePromptInjectionDetection: true,
  enableSchemaValidation: true,
  fallbackOnError: true,
  maxRetries: 1
}

export interface LLMSafetyResult {
  safe: boolean
  violations: GuardrailViolation[]
  warnings: string[]
  flagged: boolean
}

/**
 * Detect prompt injection attempts
 */
export function detectPromptInjection(
  messages: Array<{ role: string; content: string }>,
  options: {
    origin: string
    traceId: string
    spanId?: string
  }
): LLMSafetyResult {
  const violations: GuardrailViolation[] = []
  const warnings: string[] = []
  let flagged = false

  // Patterns that indicate prompt injection attempts
  const injectionPatterns = [
    {
      pattern: /ignore\s+(previous|above|all)\s+(instructions|prompts|commands)/gi,
      severity: 'critical' as const,
      message: 'Prompt injection attempt: Ignore previous instructions'
    },
    {
      pattern: /system\s*:\s*you\s+are\s+now/gi,
      severity: 'high' as const,
      message: 'Prompt injection attempt: System role override'
    },
    {
      pattern: /act\s+as\s+(a\s+)?(different|new|another)\s+(ai|assistant|system)/gi,
      severity: 'high' as const,
      message: 'Prompt injection attempt: Role change request'
    },
    {
      pattern: /forget\s+(everything|all|previous)/gi,
      severity: 'medium' as const,
      message: 'Prompt injection attempt: Memory wipe request'
    },
    {
      pattern: /(reveal|show|display|print)\s+(your|the)\s+(system\s+)?(prompt|instructions)/gi,
      severity: 'high' as const,
      message: 'Prompt injection attempt: System prompt extraction'
    },
    {
      pattern: /<!--[\s\S]*?-->/g,
      severity: 'medium' as const,
      message: 'Hidden HTML comments detected in prompt'
    },
    {
      pattern: /<\s*script[\s\S]*?>/gi,
      severity: 'critical' as const,
      message: 'Script tag detected in prompt'
    },
    {
      pattern: /\u200B|\u200C|\u200D|\uFEFF/g,
      severity: 'medium' as const,
      message: 'Zero-width characters detected (potential obfuscation)'
    }
  ]

  for (const message of messages) {
    if (message.role !== 'user') continue

    for (const { pattern, severity, message: msg } of injectionPatterns) {
      const matches = message.content.match(pattern)
      if (matches) {
        flagged = true
        const violation: GuardrailViolation = {
          id: uuidv4(),
          type: 'llm_safety',
          severity,
          message: msg,
          origin: options.origin,
          traceId: options.traceId,
          spanId: options.spanId,
          timestamp: new Date().toISOString(),
          metadata: {
            pattern: pattern.source,
            occurrences: matches.length,
            messageRole: message.role
          }
        }
        violations.push(violation)
      }
    }

    // Check for suspiciously long prompts (potential abuse)
    if (message.content.length > 10000) {
      warnings.push(`User message is very long (${message.content.length} characters)`)
    }

    // Check for excessive repetition (potential token stuffing)
    const words = message.content.split(/\s+/)
    const uniqueWords = new Set(words)
    if (words.length > 100 && uniqueWords.size / words.length < 0.3) {
      warnings.push('High repetition detected in user message (potential token stuffing)')
    }
  }

  return {
    safe: violations.filter((v) => v.severity === 'critical').length === 0,
    violations,
    warnings,
    flagged
  }
}

/**
 * Validate LLM response against schema
 */
export function validateLLMResponse<T = any>(
  response: string,
  schema?: any
): { valid: boolean; data?: T; errors: string[] } {
  const errors: string[] = []

  // Try to parse JSON
  let parsed: any
  try {
    parsed = JSON.parse(response)
  } catch (error) {
    errors.push('Failed to parse LLM response as JSON')
    return { valid: false, errors }
  }

  // If schema provided, validate against it
  if (schema) {
    // Basic schema validation (you can use a library like Zod for more robust validation)
    const schemaErrors = validateAgainstSchema(parsed, schema)
    if (schemaErrors.length > 0) {
      errors.push(...schemaErrors)
      return { valid: false, errors }
    }
  }

  return { valid: true, data: parsed, errors }
}

/**
 * Basic schema validation
 */
function validateAgainstSchema(data: any, schema: any): string[] {
  const errors: string[] = []

  if (schema.type === 'object' && schema.properties) {
    if (typeof data !== 'object' || data === null) {
      errors.push('Expected object')
      return errors
    }

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`Missing required field: ${field}`)
        }
      }
    }

    // Validate properties
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in data) {
        const propErrors = validateAgainstSchema(data[key], propSchema)
        errors.push(...propErrors.map((e) => `${key}.${e}`))
      }
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(data)) {
      errors.push('Expected array')
      return errors
    }

    if (schema.items) {
      data.forEach((item, index) => {
        const itemErrors = validateAgainstSchema(item, schema.items)
        errors.push(...itemErrors.map((e) => `[${index}].${e}`))
      })
    }
  } else if (schema.type) {
    const actualType = typeof data
    if (actualType !== schema.type) {
      errors.push(`Expected ${schema.type}, got ${actualType}`)
    }
  }

  return errors
}

/**
 * Safe LLM call with all guardrails
 */
export async function safeLLMCall<T = any>(
  llmCallFn: () => Promise<LLMCallResult>,
  options: {
    origin: string
    messages: LLMCallOptions['messages']
    schema?: any
    config?: Partial<LLMSafetyConfig>
  }
): Promise<{ success: boolean; data?: T; result?: LLMCallResult; error?: string }> {
  const config: LLMSafetyConfig = {
    ...DEFAULT_LLM_SAFETY_CONFIG,
    ...options.config
  }

  const span = createSpan({
    name: 'safe_llm.call',
    attributes: {
      origin: options.origin,
      messageCount: options.messages.length,
      hasSchema: !!options.schema
    }
  })

  const traceId = span.getSpan().traceId

  try {
    // Step 1: Check for prompt injection
    if (config.enablePromptInjectionDetection) {
      span.addEvent('prompt_injection_check')

      const injectionResult = detectPromptInjection(options.messages, {
        origin: options.origin,
        traceId,
        spanId: span.getSpan().id
      })

      if (injectionResult.flagged) {
        span.setAttribute('llm_output_flagged', true)
        span.addEvent('prompt_injection_detected', {
          violations: injectionResult.violations.length
        })
      }

      if (!injectionResult.safe) {
        await span.end('error', 'Prompt injection detected')
        return {
          success: false,
          error: 'Prompt injection detected: ' + injectionResult.violations[0].message
        }
      }

      if (injectionResult.warnings.length > 0) {
        span.addEvent('llm_safety_warnings', {
          warnings: injectionResult.warnings
        })
      }
    }

    // Step 2: Call LLM with retry
    span.addEvent('llm_call_start')

    const callResult = await retrySafe(llmCallFn, {
      origin: options.origin,
      config: {
        maxAttempts: config.maxRetries + 1,
        intervals: [1000, 2000]
      }
    })

    if (!callResult.success) {
      if (config.fallbackOnError) {
        span.addEvent('llm_call_failed_using_fallback')
        await span.end('ok')
        return {
          success: true,
          data: undefined as any,
          error: 'LLM call failed, using fallback'
        }
      } else {
        await span.end('error', callResult.error)
        return {
          success: false,
          error: callResult.error
        }
      }
    }

    const llmResult = callResult.data as LLMCallResult

    // Step 3: Validate response schema
    if (config.enableSchemaValidation && options.schema) {
      span.addEvent('schema_validation')

      const validation = validateLLMResponse<T>(llmResult.content, options.schema)

      if (!validation.valid) {
        span.setAttribute('llm_output_flagged', true)
        span.addEvent('schema_validation_failed', {
          errors: validation.errors
        })

        if (config.fallbackOnError) {
          await span.end('ok')
          return {
            success: true,
            data: undefined as any,
            error: 'Schema validation failed, using fallback'
          }
        } else {
          await span.end('error', 'Schema validation failed')
          return {
            success: false,
            error: 'Schema validation failed: ' + validation.errors.join(', ')
          }
        }
      }

      await span.end('ok')
      return {
        success: true,
        data: validation.data,
        result: llmResult
      }
    } else {
      // No schema validation, return raw result
      await span.end('ok')
      return {
        success: true,
        data: llmResult.content as any,
        result: llmResult
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    span.addEvent('safe_llm_error', { error: errorMessage })
    await span.end('error', errorMessage)

    if (config.fallbackOnError) {
      return {
        success: true,
        data: undefined as any,
        error: errorMessage
      }
    }

    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * Get default LLM safety configuration
 */
export function getDefaultLLMSafetyConfig(): LLMSafetyConfig {
  return { ...DEFAULT_LLM_SAFETY_CONFIG }
}
