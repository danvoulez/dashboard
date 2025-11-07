/**
 * Safe LLM Wrapper - Secure LLM calls with validation, caching, and fallback
 */

import { createSpan } from '@/utils/span'
import { getLLMSecurity } from '@/security/llm_security'
import { callLLM, createLLMClient } from './client'
import type { LLMConfig, LLMMessage, LLMCallOptions, LLMCallResult } from '@/types'

export interface SafeLLMOptions extends LLMCallOptions {
  tenantId?: string
  enableCache?: boolean
  enableFallback?: boolean
  schema?: any
  maxRetries?: number
}

export interface SafeLLMResult extends LLMCallResult {
  cached?: boolean
  cacheAge?: number
  promptHash?: string
  injectionDetected?: boolean
  fallbackUsed?: boolean
  promptSplit?: {
    systemPrompt: string
    userInput: string
    estimatedTokens: number
  }
}

/**
 * Call LLM with comprehensive security checks
 */
export async function callSafeLLM(
  config: LLMConfig,
  options: SafeLLMOptions
): Promise<SafeLLMResult> {
  const span = createSpan({
    name: 'llm.safe_call',
    kind: 'client',
    attributes: {
      provider: config.provider,
      model: config.model,
      tenantId: options.tenantId || 'default',
      enableCache: options.enableCache !== false,
      enableFallback: options.enableFallback !== false
    }
  })

  const security = getLLMSecurity()
  const tenantId = options.tenantId || 'default'

  try {
    // 1. Split prompt into components
    const promptComponents = security.splitPrompt(options.messages)
    span.addEvent('prompt_split', {
      systemPromptLength: promptComponents.systemPrompt.length,
      userInputLength: promptComponents.userInput.length,
      estimatedTokens: promptComponents.estimatedTokens,
      hash: promptComponents.hash.substring(0, 16)
    })

    // 2. Check for prompt injection
    const injectionCheck = security.detectPromptInjection(promptComponents.userInput)
    if (injectionCheck.detected) {
      span.addEvent('prompt_injection_detected', {
        patterns: injectionCheck.patterns
      })

      // Log but don't block (policy decision)
      span.setAttribute('injection_patterns', injectionCheck.patterns.join(', '))
    }

    // 3. Check token quota
    const quotaCheck = security.checkTokenQuota(tenantId, promptComponents.estimatedTokens)
    if (!quotaCheck.allowed) {
      span.addEvent('quota_exceeded', { reason: quotaCheck.reason })
      await span.end('error', quotaCheck.reason)
      throw new Error(quotaCheck.reason)
    }

    span.setAttribute('quota_remaining', quotaCheck.remaining || 0)

    // 4. Check cache
    if (options.enableCache !== false) {
      const cached = security.getCachedResponse(promptComponents.hash)
      if (cached) {
        span.addEvent('cache_hit', {
          age: cached.age,
          hash: promptComponents.hash.substring(0, 16)
        })

        await span.end('ok')

        return {
          content: cached.content,
          model: config.model || 'cached',
          cached: true,
          cacheAge: cached.age,
          promptHash: promptComponents.hash,
          injectionDetected: injectionCheck.detected,
          promptSplit: promptComponents
        }
      }

      span.addEvent('cache_miss')
    }

    // 5. Call LLM with retry and fallback
    let result: LLMCallResult
    let fallbackUsed = false
    const maxRetries = options.maxRetries || 2

    try {
      span.addEvent('calling_primary_llm', { provider: config.provider })
      result = await callLLMWithRetry(config, options, maxRetries, span)
    } catch (primaryError) {
      span.addEvent('primary_llm_failed', {
        error: primaryError instanceof Error ? primaryError.message : String(primaryError)
      })

      if (options.enableFallback !== false) {
        const fallbackConfig = security.getFallbackProvider(config.provider)

        if (fallbackConfig) {
          span.addEvent('attempting_fallback', { provider: fallbackConfig.provider })

          try {
            result = await callLLMWithRetry(fallbackConfig, options, maxRetries, span)
            fallbackUsed = true
            span.setAttribute('fallback_provider', fallbackConfig.provider)
          } catch (fallbackError) {
            span.addEvent('fallback_failed', {
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            })
            throw primaryError // Throw original error
          }
        } else {
          throw primaryError
        }
      } else {
        throw primaryError
      }
    }

    // 6. Validate response
    const validation = security.validateResponse(result.content, {
      expectedFormat: options.responseFormat,
      maxLength: 100000, // 100KB
      schema: options.schema
    })

    if (!validation.valid) {
      span.addEvent('response_validation_failed', { error: validation.error })
      await span.end('error', validation.error)
      throw new Error(`Response validation failed: ${validation.error}`)
    }

    span.addEvent('response_validated')

    // 7. Record actual token usage
    if (result.usage) {
      security.recordTokenUsage(tenantId, result.usage.totalTokens)
      span.setAttribute('actual_tokens', result.usage.totalTokens)
    }

    // 8. Cache response
    if (options.enableCache !== false) {
      security.cacheResponse(promptComponents.hash, result.content)
      span.addEvent('response_cached', { hash: promptComponents.hash.substring(0, 16) })
    }

    await span.end('ok')

    return {
      ...result,
      cached: false,
      promptHash: promptComponents.hash,
      injectionDetected: injectionCheck.detected,
      fallbackUsed,
      promptSplit: promptComponents
    }
  } catch (error) {
    await span.end('error', error instanceof Error ? error.message : String(error))
    throw error
  }
}

/**
 * Call LLM with retry logic
 */
async function callLLMWithRetry(
  config: LLMConfig,
  options: LLMCallOptions,
  maxRetries: number,
  span: any
): Promise<LLMCallResult> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000) // Exponential backoff, max 5s
        span.addEvent('retry_attempt', { attempt, delay })
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      return await callLLM(config, options)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      span.addEvent('llm_call_failed', {
        attempt,
        error: lastError.message
      })

      // Don't retry on certain errors
      if (
        lastError.message.includes('quota') ||
        lastError.message.includes('authentication') ||
        lastError.message.includes('unauthorized')
      ) {
        throw lastError
      }
    }
  }

  throw lastError || new Error('LLM call failed after retries')
}

/**
 * Call LLM with JSON schema validation
 */
export async function callSafeLLMWithSchema<T = any>(
  config: LLMConfig,
  options: SafeLLMOptions
): Promise<{ data: T; metadata: SafeLLMResult }> {
  const result = await callSafeLLM(config, {
    ...options,
    responseFormat: 'json'
  })

  try {
    const data = JSON.parse(result.content) as T
    return { data, metadata: result }
  } catch (error) {
    throw new Error(`Failed to parse LLM JSON response: ${error}`)
  }
}

/**
 * Batch LLM calls with deduplication
 */
export async function batchSafeLLM(
  config: LLMConfig,
  requests: SafeLLMOptions[]
): Promise<SafeLLMResult[]> {
  const span = createSpan({
    name: 'llm.batch_call',
    attributes: {
      batchSize: requests.length
    }
  })

  try {
    const security = getLLMSecurity()

    // Deduplicate by hash
    const uniqueRequests = new Map<string, SafeLLMOptions>()
    const requestMapping = new Map<number, string>()

    for (let i = 0; i < requests.length; i++) {
      const hash = security.splitPrompt(requests[i].messages).hash
      requestMapping.set(i, hash)

      if (!uniqueRequests.has(hash)) {
        uniqueRequests.set(hash, requests[i])
      }
    }

    span.addEvent('batch_deduplicated', {
      original: requests.length,
      unique: uniqueRequests.size
    })

    // Execute unique requests
    const results = new Map<string, SafeLLMResult>()
    for (const [hash, request] of uniqueRequests.entries()) {
      const result = await callSafeLLM(config, request)
      results.set(hash, result)
    }

    // Map results back to original order
    const finalResults: SafeLLMResult[] = []
    for (let i = 0; i < requests.length; i++) {
      const hash = requestMapping.get(i)!
      finalResults.push(results.get(hash)!)
    }

    await span.end('ok')
    return finalResults
  } catch (error) {
    await span.end('error', error instanceof Error ? error.message : String(error))
    throw error
  }
}

/**
 * Get LLM statistics
 */
export function getLLMStats(tenantId?: string) {
  const security = getLLMSecurity()
  return security.getStats(tenantId)
}

/**
 * Reset LLM quota (admin function)
 */
export function resetLLMQuota(tenantId: string) {
  const security = getLLMSecurity()
  security.resetQuota(tenantId)
}

/**
 * Clear LLM cache
 */
export function clearLLMCache() {
  const security = getLLMSecurity()
  security.clearCache()
}
