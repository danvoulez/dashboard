/**
 * LLM Security & Optimization
 *
 * Features:
 * - Prompt splitting (stable system prompt + variable user input)
 * - Prompt hash for caching and deduplication
 * - Response validation
 * - Token quota enforcement
 * - Fallback to alternative providers
 * - Prompt injection detection
 */

import type { LLMConfig, LLMMessage, LLMCallOptions, LLMCallResult } from '@/types'

interface PromptComponents {
  systemPrompt: string
  userInput: string
  hash: string
  estimatedTokens: number
}

interface TokenQuota {
  maxTokensPerRequest: number
  maxTokensPerMinute: number
  maxTokensPerHour: number
}

interface CacheEntry {
  hash: string
  response: string
  timestamp: number
  hits: number
}

export class LLMSecurity {
  private responseCache = new Map<string, CacheEntry>()
  private tokenUsage = new Map<string, { count: number; windowStart: number }>()

  private readonly DEFAULT_QUOTA: TokenQuota = {
    maxTokensPerRequest: 4000,
    maxTokensPerMinute: 20000,
    maxTokensPerHour: 100000
  }

  private readonly CACHE_TTL = 3600000 // 1 hour
  private readonly MINUTE = 60000
  private readonly HOUR = 3600000

  /**
   * Split prompt into stable and variable components
   */
  splitPrompt(messages: LLMMessage[]): PromptComponents {
    const systemMessages = messages.filter(m => m.role === 'system')
    const userMessages = messages.filter(m => m.role === 'user')

    const systemPrompt = systemMessages.map(m => m.content).join('\n\n')
    const userInput = userMessages.map(m => m.content).join('\n\n')

    // Compute hash for caching/deduplication
    const hash = this.computePromptHash(messages)

    // Estimate tokens (rough approximation: 1 token ~= 4 characters)
    const estimatedTokens = Math.ceil((systemPrompt.length + userInput.length) / 4)

    return {
      systemPrompt,
      userInput,
      hash,
      estimatedTokens
    }
  }

  /**
   * Compute SHA-256 hash of messages
   */
  async computePromptHash(messages: LLMMessage[]): Promise<string> {
    const promptString = JSON.stringify(messages.map(m => ({ role: m.role, content: m.content })))
    const encoder = new TextEncoder()
    const data = encoder.encode(promptString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)

    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * Synchronous hash for quick cache lookups
   */
  computePromptHash(messages: LLMMessage[]): string {
    const promptString = JSON.stringify(messages.map(m => ({ role: m.role, content: m.content })))

    // Simple hash for synchronous use
    let hash = 0
    for (let i = 0; i < promptString.length; i++) {
      const char = promptString.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }

    return hash.toString(16)
  }

  /**
   * Check for prompt injection patterns
   */
  detectPromptInjection(input: string): { detected: boolean; patterns: string[] } {
    const patterns: string[] = []

    const injectionPatterns = [
      {
        regex: /ignore\s+(previous|all|above|prior)\s+(instructions|prompts|rules)/gi,
        name: 'ignore_instructions'
      },
      {
        regex: /forget\s+(everything|all|previous)/gi,
        name: 'forget_context'
      },
      {
        regex: /you\s+are\s+now\s+(a|an)/gi,
        name: 'role_override'
      },
      {
        regex: /system\s*:\s*you/gi,
        name: 'system_impersonation'
      },
      {
        regex: /<\s*system\s*>/gi,
        name: 'system_tag_injection'
      },
      {
        regex: /\[system\]/gi,
        name: 'system_bracket_injection'
      },
      {
        regex: /repeat\s+(the\s+)?password/gi,
        name: 'credential_extraction'
      },
      {
        regex: /show\s+(me\s+)?(your|the)\s+(prompt|instructions|system)/gi,
        name: 'prompt_disclosure'
      }
    ]

    for (const { regex, name } of injectionPatterns) {
      if (regex.test(input)) {
        patterns.push(name)
      }
    }

    return {
      detected: patterns.length > 0,
      patterns
    }
  }

  /**
   * Validate response format
   */
  validateResponse(
    response: string,
    options: {
      expectedFormat?: 'json' | 'text'
      maxLength?: number
      schema?: any
    } = {}
  ): { valid: boolean; error?: string } {
    // Check length
    if (options.maxLength && response.length > options.maxLength) {
      return {
        valid: false,
        error: `Response too long: ${response.length} > ${options.maxLength}`
      }
    }

    // Check format
    if (options.expectedFormat === 'json') {
      try {
        const parsed = JSON.parse(response)

        // Basic schema validation if provided
        if (options.schema) {
          const validation = this.validateSchema(parsed, options.schema)
          if (!validation.valid) {
            return validation
          }
        }
      } catch (error) {
        return {
          valid: false,
          error: 'Invalid JSON response'
        }
      }
    }

    // Check for prompt leakage (response contains system prompt)
    if (this.detectPromptLeakage(response)) {
      return {
        valid: false,
        error: 'Response contains potential prompt leakage'
      }
    }

    return { valid: true }
  }

  /**
   * Basic schema validation
   */
  private validateSchema(data: any, schema: any): { valid: boolean; error?: string } {
    if (schema.type === 'object') {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return { valid: false, error: 'Expected object' }
      }

      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in data)) {
            return { valid: false, error: `Missing required field: ${key}` }
          }
        }
      }
    }

    if (schema.type === 'array') {
      if (!Array.isArray(data)) {
        return { valid: false, error: 'Expected array' }
      }
    }

    return { valid: true }
  }

  /**
   * Detect prompt leakage in response
   */
  private detectPromptLeakage(response: string): boolean {
    const leakagePatterns = [
      /system\s*:\s*you\s+are/gi,
      /your\s+instructions\s+are/gi,
      /the\s+system\s+prompt\s+is/gi
    ]

    return leakagePatterns.some(pattern => pattern.test(response))
  }

  /**
   * Check token quota
   */
  checkTokenQuota(
    tenantId: string,
    estimatedTokens: number,
    quota: Partial<TokenQuota> = {}
  ): { allowed: boolean; reason?: string; remaining?: number } {
    const effectiveQuota = { ...this.DEFAULT_QUOTA, ...quota }

    // Check per-request limit
    if (estimatedTokens > effectiveQuota.maxTokensPerRequest) {
      return {
        allowed: false,
        reason: `Request exceeds token limit: ${estimatedTokens} > ${effectiveQuota.maxTokensPerRequest}`
      }
    }

    const now = Date.now()
    let usage = this.tokenUsage.get(tenantId)

    // Initialize or reset if window expired
    if (!usage || now - usage.windowStart > this.HOUR) {
      usage = { count: 0, windowStart: now }
      this.tokenUsage.set(tenantId, usage)
    }

    // Check per-minute limit (approximate)
    if (now - usage.windowStart < this.MINUTE) {
      const estimatedPerMinute = usage.count + estimatedTokens
      if (estimatedPerMinute > effectiveQuota.maxTokensPerMinute) {
        return {
          allowed: false,
          reason: `Token rate limit exceeded: ${estimatedPerMinute} > ${effectiveQuota.maxTokensPerMinute} tokens/minute`
        }
      }
    }

    // Check per-hour limit
    if (usage.count + estimatedTokens > effectiveQuota.maxTokensPerHour) {
      return {
        allowed: false,
        reason: `Hourly token quota exceeded: ${usage.count + estimatedTokens} > ${effectiveQuota.maxTokensPerHour}`
      }
    }

    usage.count += estimatedTokens

    return {
      allowed: true,
      remaining: effectiveQuota.maxTokensPerHour - usage.count
    }
  }

  /**
   * Record actual token usage
   */
  recordTokenUsage(tenantId: string, tokens: number): void {
    let usage = this.tokenUsage.get(tenantId)
    if (!usage) {
      usage = { count: 0, windowStart: Date.now() }
      this.tokenUsage.set(tenantId, usage)
    }
    usage.count += tokens
  }

  /**
   * Get cached response
   */
  getCachedResponse(hash: string): { content: string; age: number } | null {
    const entry = this.responseCache.get(hash)
    if (!entry) return null

    const age = Date.now() - entry.timestamp

    // Check TTL
    if (age > this.CACHE_TTL) {
      this.responseCache.delete(hash)
      return null
    }

    entry.hits++
    return {
      content: entry.response,
      age
    }
  }

  /**
   * Cache response
   */
  cacheResponse(hash: string, response: string): void {
    this.responseCache.set(hash, {
      hash,
      response,
      timestamp: Date.now(),
      hits: 0
    })

    // Cleanup old entries
    this.cleanupCache()
  }

  /**
   * Cleanup old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now()
    for (const [hash, entry] of this.responseCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.responseCache.delete(hash)
      }
    }
  }

  /**
   * Get fallback provider config
   */
  getFallbackProvider(primaryProvider: string): LLMConfig | null {
    // Define fallback chain
    const fallbacks: Record<string, string[]> = {
      'openai': ['macmind', 'ollama'],
      'macmind': ['ollama'],
      'ollama': ['macmind']
    }

    const fallbackChain = fallbacks[primaryProvider]
    if (!fallbackChain || fallbackChain.length === 0) {
      return null
    }

    // Return first fallback with basic config
    return {
      provider: fallbackChain[0] as any,
      model: this.getDefaultModel(fallbackChain[0]),
      endpoint: this.getDefaultEndpoint(fallbackChain[0])
    }
  }

  /**
   * Get default model for provider
   */
  private getDefaultModel(provider: string): string {
    const defaults: Record<string, string> = {
      'openai': 'gpt-3.5-turbo',
      'ollama': 'llama2',
      'macmind': 'default'
    }
    return defaults[provider] || 'default'
  }

  /**
   * Get default endpoint for provider
   */
  private getDefaultEndpoint(provider: string): string | undefined {
    const endpoints: Record<string, string> = {
      'openai': 'https://api.openai.com/v1/chat/completions',
      'ollama': 'http://localhost:11434/api/chat',
      'macmind': 'http://localhost:8000/v1/chat/completions'
    }
    return endpoints[provider]
  }

  /**
   * Get statistics
   */
  getStats(tenantId?: string) {
    if (tenantId) {
      const usage = this.tokenUsage.get(tenantId)
      return {
        tokenUsage: usage?.count || 0,
        cacheSize: this.responseCache.size,
        quotaRemaining: usage
          ? this.DEFAULT_QUOTA.maxTokensPerHour - usage.count
          : this.DEFAULT_QUOTA.maxTokensPerHour
      }
    }

    return {
      totalCacheEntries: this.responseCache.size,
      totalTenants: this.tokenUsage.size
    }
  }

  /**
   * Reset quota (admin function)
   */
  resetQuota(tenantId: string): void {
    this.tokenUsage.delete(tenantId)
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.responseCache.clear()
  }
}

// Singleton
let securityInstance: LLMSecurity | null = null

export function getLLMSecurity(): LLMSecurity {
  if (!securityInstance) {
    securityInstance = new LLMSecurity()
  }
  return securityInstance
}
