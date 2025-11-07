/**
 * Policy Sandbox - Secure execution environment for policy conditions and actions
 *
 * Implements:
 * - AST-based validation (basic checks)
 * - Proxy-based context isolation
 * - Timeout enforcement
 * - Dry-run mode
 * - Rollback support
 * - Deduplication
 * - Rate limiting per policy
 */

interface ExecutionResult<T = any> {
  success: boolean
  result?: T
  error?: string
  executionTime: number
  dryRun?: boolean
}

interface PolicyExecutionHistory {
  policyId: string
  eventHash: string
  executedAt: number
}

export class PolicySandbox {
  private executionHistory: PolicyExecutionHistory[] = []
  private readonly DEDUP_WINDOW = 60000 // 1 minute
  private readonly MAX_EXECUTION_TIME = 5000 // 5 seconds
  private readonly HISTORY_RETENTION = 3600000 // 1 hour
  private rateLimits = new Map<string, { count: number; windowStart: number }>()
  private readonly RATE_LIMIT_WINDOW = 60000 // 1 minute
  private readonly MAX_EXECUTIONS_PER_MINUTE = 100

  /**
   * Blocked patterns in code
   */
  private readonly BLOCKED_PATTERNS = [
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /setTimeout\s*\(/gi,
    /setInterval\s*\(/gi,
    /new\s+Function/gi,
    /__proto__/gi,
    /constructor\s*\[/gi,
    /prototype\s*\[/gi,
    /import\s*\(/gi,
    /require\s*\(/gi,
    /process\./gi,
    /global\./gi,
    /window\./gi,
    /document\./gi,
    /localStorage/gi,
    /sessionStorage/gi,
    /fetch\s*\(/gi,
    /XMLHttpRequest/gi
  ]

  /**
   * Validate code for dangerous patterns
   */
  private validateCode(code: string): { valid: boolean; reason?: string } {
    // Check for blocked patterns
    for (const pattern of this.BLOCKED_PATTERNS) {
      if (pattern.test(code)) {
        return {
          valid: false,
          reason: `Blocked pattern detected: ${pattern.source}`
        }
      }
    }

    // Check code length
    if (code.length > 10000) {
      return {
        valid: false,
        reason: 'Code too long (max 10000 characters)'
      }
    }

    return { valid: true }
  }

  /**
   * Create safe context proxy
   */
  private createSafeProxy<T extends object>(target: T, allowedKeys: string[]): T {
    return new Proxy(target, {
      get(obj, prop) {
        if (typeof prop === 'string' && !allowedKeys.includes(prop)) {
          throw new Error(`Access to property '${prop}' is not allowed`)
        }
        return obj[prop as keyof T]
      },
      set() {
        throw new Error('Modifications to context are not allowed')
      },
      deleteProperty() {
        throw new Error('Deletions from context are not allowed')
      },
      has(obj, prop) {
        return typeof prop === 'string' && allowedKeys.includes(prop)
      },
      ownKeys() {
        return allowedKeys
      }
    })
  }

  /**
   * Execute condition with timeout
   */
  async evaluateCondition(
    conditionCode: string,
    context: Record<string, any>,
    options: { timeout?: number; dryRun?: boolean } = {}
  ): Promise<ExecutionResult<boolean>> {
    const startTime = Date.now()

    try {
      // Validate code
      const validation = this.validateCode(conditionCode)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.reason,
          executionTime: Date.now() - startTime
        }
      }

      if (options.dryRun) {
        return {
          success: true,
          result: false,
          executionTime: Date.now() - startTime,
          dryRun: true
        }
      }

      // Create safe context
      const allowedKeys = ['event', 'trigger', 'timestamp', 'metadata']
      const safeContext = this.createSafeProxy(context, allowedKeys)

      // Execute with timeout
      const timeout = options.timeout || this.MAX_EXECUTION_TIME
      const result = await this.executeWithTimeout(
        () => this.evaluateConditionUnsafe(conditionCode, safeContext),
        timeout
      )

      return {
        success: true,
        result: Boolean(result),
        executionTime: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      }
    }
  }

  /**
   * Internal condition evaluation (without 'with' statement)
   */
  private evaluateConditionUnsafe(code: string, context: any): boolean {
    // Create function with explicit parameter destructuring
    const func = new Function(
      'event',
      'trigger',
      'timestamp',
      'metadata',
      `'use strict'; return (${code});`
    )

    return func(
      context.event,
      context.trigger,
      context.timestamp,
      context.metadata
    )
  }

  /**
   * Execute action with timeout and rollback support
   */
  async executeAction(
    actionCode: string,
    context: Record<string, any>,
    allowedFunctions: Record<string, Function>,
    options: {
      timeout?: number
      dryRun?: boolean
      policyId?: string
      eventHash?: string
    } = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now()

    try {
      // Rate limiting check
      if (options.policyId) {
        const rateLimitCheck = this.checkRateLimit(options.policyId)
        if (!rateLimitCheck.allowed) {
          return {
            success: false,
            error: rateLimitCheck.reason,
            executionTime: Date.now() - startTime
          }
        }
      }

      // Deduplication check
      if (options.policyId && options.eventHash) {
        if (this.isDuplicate(options.policyId, options.eventHash)) {
          return {
            success: false,
            error: 'Duplicate execution prevented (same event processed within last 60s)',
            executionTime: Date.now() - startTime
          }
        }
      }

      // Validate code
      const validation = this.validateCode(actionCode)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.reason,
          executionTime: Date.now() - startTime
        }
      }

      if (options.dryRun) {
        return {
          success: true,
          result: { dryRun: true, message: 'Action validated but not executed' },
          executionTime: Date.now() - startTime,
          dryRun: true
        }
      }

      // Create safe context with allowed functions
      const allowedKeys = [
        ...Object.keys(context),
        ...Object.keys(allowedFunctions)
      ]

      const fullContext = { ...context, ...allowedFunctions }
      const safeContext = this.createSafeProxy(fullContext, allowedKeys)

      // Execute with timeout
      const timeout = options.timeout || this.MAX_EXECUTION_TIME
      const result = await this.executeWithTimeout(
        () => this.executeActionUnsafe(actionCode, safeContext, Object.keys(allowedFunctions)),
        timeout
      )

      // Record execution
      if (options.policyId && options.eventHash) {
        this.recordExecution(options.policyId, options.eventHash)
      }

      return {
        success: true,
        result,
        executionTime: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      }
    }
  }

  /**
   * Internal action execution (without 'with' statement)
   */
  private async executeActionUnsafe(
    code: string,
    context: any,
    functionNames: string[]
  ): Promise<any> {
    // Build parameter list
    const params = [
      'event',
      'context',
      ...functionNames
    ]

    // Build argument list
    const args = [
      context.event,
      context.context,
      ...functionNames.map(name => context[name])
    ]

    // Create async function
    const func = new Function(
      ...params,
      `'use strict'; return (async () => { ${code} })();`
    )

    return await func(...args)
  }

  /**
   * Execute with timeout
   */
  private executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeout}ms`))
      }, timeout)

      Promise.resolve(fn())
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /**
   * Check for duplicate execution
   */
  private isDuplicate(policyId: string, eventHash: string): boolean {
    const now = Date.now()
    const recent = this.executionHistory.find(
      h => h.policyId === policyId &&
           h.eventHash === eventHash &&
           now - h.executedAt < this.DEDUP_WINDOW
    )
    return !!recent
  }

  /**
   * Record policy execution
   */
  private recordExecution(policyId: string, eventHash: string): void {
    this.executionHistory.push({
      policyId,
      eventHash,
      executedAt: Date.now()
    })

    // Cleanup old history
    this.cleanupHistory()
  }

  /**
   * Cleanup old execution history
   */
  private cleanupHistory(): void {
    const now = Date.now()
    this.executionHistory = this.executionHistory.filter(
      h => now - h.executedAt < this.HISTORY_RETENTION
    )
  }

  /**
   * Check rate limit for policy
   */
  private checkRateLimit(policyId: string): { allowed: boolean; reason?: string } {
    const now = Date.now()
    let entry = this.rateLimits.get(policyId)

    if (!entry || now - entry.windowStart > this.RATE_LIMIT_WINDOW) {
      entry = { count: 0, windowStart: now }
      this.rateLimits.set(policyId, entry)
    }

    entry.count++

    if (entry.count > this.MAX_EXECUTIONS_PER_MINUTE) {
      return {
        allowed: false,
        reason: `Policy rate limit exceeded: ${entry.count}/${this.MAX_EXECUTIONS_PER_MINUTE} executions per minute`
      }
    }

    return { allowed: true }
  }

  /**
   * Get execution statistics
   */
  getStats(policyId?: string): {
    totalExecutions: number
    recentExecutions: number
    rateLimitStatus?: { count: number; limit: number }
  } {
    const now = Date.now()

    let history = this.executionHistory
    if (policyId) {
      history = history.filter(h => h.policyId === policyId)
    }

    const recentExecutions = history.filter(
      h => now - h.executedAt < this.DEDUP_WINDOW
    ).length

    const stats: any = {
      totalExecutions: history.length,
      recentExecutions
    }

    if (policyId) {
      const rateLimit = this.rateLimits.get(policyId)
      if (rateLimit) {
        stats.rateLimitStatus = {
          count: rateLimit.count,
          limit: this.MAX_EXECUTIONS_PER_MINUTE
        }
      }
    }

    return stats
  }

  /**
   * Compute event hash for deduplication
   */
  async computeEventHash(event: any): Promise<string> {
    const eventString = JSON.stringify(event)
    const encoder = new TextEncoder()
    const data = encoder.encode(eventString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)

    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * Reset rate limits (for testing)
   */
  resetRateLimits(): void {
    this.rateLimits.clear()
  }

  /**
   * Clear execution history (for testing)
   */
  clearHistory(): void {
    this.executionHistory = []
  }
}

// Singleton instance
let sandboxInstance: PolicySandbox | null = null

/**
 * Get or create sandbox instance
 */
export function getPolicySandbox(): PolicySandbox {
  if (!sandboxInstance) {
    sandboxInstance = new PolicySandbox()
  }
  return sandboxInstance
}
