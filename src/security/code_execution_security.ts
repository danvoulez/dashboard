/**
 * Enhanced Code Execution Security
 *
 * Improvements over regex-based validation:
 * - Token-based analysis (lightweight AST-like)
 * - Proxy-based context isolation
 * - Rate limiting per tenant/user
 * - Circuit breaker for failing code
 * - Quota enforcement
 */

interface ExecutionQuota {
  maxExecutionsPerMinute: number
  maxExecutionsPerHour: number
  maxCodeSize: number
  maxExecutionTime: number
}

interface ExecutionStats {
  count: number
  windowStart: number
  failures: number
  lastFailure?: number
}

interface CircuitBreakerState {
  failures: number
  lastFailure: number
  state: 'closed' | 'open' | 'half-open'
}

export class CodeExecutionSecurity {
  private executionStats = new Map<string, ExecutionStats>()
  private circuitBreakers = new Map<string, CircuitBreakerState>()

  private readonly DEFAULT_QUOTA: ExecutionQuota = {
    maxExecutionsPerMinute: 60,
    maxExecutionsPerHour: 500,
    maxCodeSize: 50000,
    maxExecutionTime: 30000
  }

  private readonly CIRCUIT_BREAKER_THRESHOLD = 5
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000 // 1 minute
  private readonly MINUTE = 60000
  private readonly HOUR = 3600000

  /**
   * Enhanced token-based validation
   */
  validateCode(code: string): {
    valid: boolean
    errors: string[]
    warnings: string[]
    risk: 'low' | 'medium' | 'high' | 'critical'
  } {
    const errors: string[] = []
    const warnings: string[] = []
    let risk: 'low' | 'medium' | 'high' | 'critical' = 'low'

    // 1. Tokenize code (simple)
    const tokens = this.tokenize(code)

    // 2. Check for dangerous token sequences
    const dangerousSequences = this.findDangerousSequences(tokens)
    if (dangerousSequences.length > 0) {
      errors.push(...dangerousSequences)
      risk = 'critical'
    }

    // 3. Check for obfuscation techniques
    const obfuscationChecks = this.checkObfuscation(code)
    if (obfuscationChecks.length > 0) {
      warnings.push(...obfuscationChecks)
      if (risk === 'low') risk = 'medium'
    }

    // 4. Check bracket balance (detect injection attempts)
    const balanceCheck = this.checkBracketBalance(code)
    if (!balanceCheck.balanced) {
      errors.push(`Unbalanced brackets: ${balanceCheck.error}`)
      risk = 'high'
    }

    // 5. Check for prototype pollution patterns
    const pollutionChecks = this.checkPrototypePollution(code)
    if (pollutionChecks.length > 0) {
      errors.push(...pollutionChecks)
      risk = 'critical'
    }

    // 6. Check for suspicious imports/requires
    const importChecks = this.checkImports(code)
    if (importChecks.length > 0) {
      errors.push(...importChecks)
      risk = 'critical'
    }

    // 7. Check string literals for hidden code
    const stringLiteralChecks = this.checkStringLiterals(code)
    if (stringLiteralChecks.length > 0) {
      warnings.push(...stringLiteralChecks)
      if (risk === 'low') risk = 'medium'
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      risk
    }
  }

  /**
   * Simple tokenizer
   */
  private tokenize(code: string): string[] {
    // Remove strings to avoid false positives
    let tokenCode = code
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, '``')

    // Split by word boundaries and operators
    return tokenCode.match(/\w+|[^\w\s]/g) || []
  }

  /**
   * Find dangerous token sequences
   */
  private findDangerousSequences(tokens: string[]): string[] {
    const errors: string[] = []

    const dangerousSequences = [
      // Direct eval
      ['eval', '('],
      // Function constructor
      ['Function', '('],
      ['new', 'Function'],
      // Constructor access
      ['constructor', '['],
      ['constructor', '('],
      // Prototype pollution
      ['__proto__', '='],
      ['prototype', '['],
      // Process/global access
      ['process', '.'],
      ['global', '.'],
      // setTimeout/setInterval (can be used to bypass restrictions)
      ['setTimeout', '('],
      ['setInterval', '('],
      // Import/require
      ['import', '('],
      ['require', '(']
    ]

    for (let i = 0; i < tokens.length - 1; i++) {
      for (const [first, second] of dangerousSequences) {
        if (tokens[i] === first && tokens[i + 1] === second) {
          errors.push(`Dangerous sequence detected: ${first}${second}`)
        }
      }
    }

    return errors
  }

  /**
   * Check for obfuscation techniques
   */
  private checkObfuscation(code: string): string[] {
    const warnings: string[] = []

    // Check for encoding functions
    if (/String\.fromCharCode/i.test(code)) {
      warnings.push('String.fromCharCode detected (possible obfuscation)')
    }

    if (/atob|btoa/i.test(code)) {
      warnings.push('Base64 encoding/decoding detected')
    }

    // Check for excessive bracket nesting
    const maxNesting = this.getMaxBracketNesting(code)
    if (maxNesting > 10) {
      warnings.push(`Deep bracket nesting detected (${maxNesting} levels)`)
    }

    // Check for hex/unicode escapes
    if (/\\x[0-9a-f]{2}/i.test(code) || /\\u[0-9a-f]{4}/i.test(code)) {
      warnings.push('Hex/Unicode escape sequences detected')
    }

    return warnings
  }

  /**
   * Check bracket balance
   */
  private checkBracketBalance(code: string): { balanced: boolean; error?: string } {
    const pairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}'
    }
    const stack: string[] = []
    const openers = Object.keys(pairs)
    const closers = Object.values(pairs)

    for (const char of code) {
      if (openers.includes(char)) {
        stack.push(char)
      } else if (closers.includes(char)) {
        const last = stack.pop()
        if (!last || pairs[last] !== char) {
          return {
            balanced: false,
            error: `Mismatched bracket: expected ${last ? pairs[last] : 'nothing'}, got ${char}`
          }
        }
      }
    }

    if (stack.length > 0) {
      return {
        balanced: false,
        error: `Unclosed brackets: ${stack.join(', ')}`
      }
    }

    return { balanced: true }
  }

  /**
   * Get maximum bracket nesting depth
   */
  private getMaxBracketNesting(code: string): number {
    let max = 0
    let current = 0

    for (const char of code) {
      if (char === '(' || char === '[' || char === '{') {
        current++
        max = Math.max(max, current)
      } else if (char === ')' || char === ']' || char === '}') {
        current--
      }
    }

    return max
  }

  /**
   * Check for prototype pollution patterns
   */
  private checkPrototypePollution(code: string): string[] {
    const errors: string[] = []

    const pollutionPatterns = [
      /__proto__/,
      /\.prototype\s*\[/,
      /constructor\s*\[\s*['"]constructor['"]\s*\]/,
      /Object\.setPrototypeOf/,
      /Object\.defineProperty.*prototype/
    ]

    for (const pattern of pollutionPatterns) {
      if (pattern.test(code)) {
        errors.push(`Prototype pollution pattern detected: ${pattern.source}`)
      }
    }

    return errors
  }

  /**
   * Check for import/require statements
   */
  private checkImports(code: string): string[] {
    const errors: string[] = []

    if (/\bimport\s*\(/i.test(code)) {
      errors.push('Dynamic import() detected')
    }

    if (/\brequire\s*\(/i.test(code)) {
      errors.push('require() detected')
    }

    if (/\bimport\s+.*\s+from/i.test(code)) {
      errors.push('ES6 import statement detected')
    }

    return errors
  }

  /**
   * Check string literals for suspicious content
   */
  private checkStringLiterals(code: string): string[] {
    const warnings: string[] = []

    // Extract string literals
    const stringMatches = code.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || []

    for (const str of stringMatches) {
      // Check for code-like content in strings
      if (/function\s*\(|=>\s*{|eval\(|new\s+Function/i.test(str)) {
        warnings.push(`String literal contains code-like content: ${str.substring(0, 30)}...`)
      }
    }

    return warnings
  }

  /**
   * Create Proxy-based secure context
   */
  createSecureContext<T extends object>(
    baseContext: T,
    allowedKeys: string[]
  ): T {
    const frozenContext = Object.freeze({ ...baseContext })

    return new Proxy(frozenContext as T, {
      get(target, prop) {
        if (typeof prop === 'string') {
          // Check if key is allowed
          if (!allowedKeys.includes(prop)) {
            throw new Error(`Access to '${prop}' is not allowed in secure context`)
          }

          const value = target[prop as keyof T]

          // If it's a function, bind it to prevent 'this' manipulation
          if (typeof value === 'function') {
            return value.bind(target)
          }

          return value
        }

        throw new Error(`Access to symbol properties is not allowed`)
      },

      set() {
        throw new Error('Context is immutable')
      },

      deleteProperty() {
        throw new Error('Context is immutable')
      },

      defineProperty() {
        throw new Error('Context is immutable')
      },

      setPrototypeOf() {
        throw new Error('Cannot modify context prototype')
      },

      has(target, prop) {
        return typeof prop === 'string' && allowedKeys.includes(prop)
      },

      ownKeys() {
        return allowedKeys
      },

      getOwnPropertyDescriptor(target, prop) {
        if (typeof prop === 'string' && allowedKeys.includes(prop)) {
          return {
            value: target[prop as keyof T],
            writable: false,
            enumerable: true,
            configurable: false
          }
        }
        return undefined
      }
    })
  }

  /**
   * Check execution quota
   */
  checkQuota(
    tenantId: string,
    quota: Partial<ExecutionQuota> = {}
  ): { allowed: boolean; reason?: string; remaining?: number } {
    const effectiveQuota = { ...this.DEFAULT_QUOTA, ...quota }
    const now = Date.now()

    let stats = this.executionStats.get(tenantId)

    // Initialize or reset if window expired
    if (!stats || now - stats.windowStart > this.HOUR) {
      stats = {
        count: 0,
        windowStart: now,
        failures: 0
      }
      this.executionStats.set(tenantId, stats)
    }

    // Count executions in last minute
    const recentCount = stats.count

    // Check per-minute limit
    if (now - stats.windowStart < this.MINUTE) {
      if (recentCount >= effectiveQuota.maxExecutionsPerMinute) {
        return {
          allowed: false,
          reason: `Rate limit exceeded: ${recentCount}/${effectiveQuota.maxExecutionsPerMinute} executions per minute`
        }
      }
    }

    // Check per-hour limit
    if (stats.count >= effectiveQuota.maxExecutionsPerHour) {
      return {
        allowed: false,
        reason: `Quota exceeded: ${stats.count}/${effectiveQuota.maxExecutionsPerHour} executions per hour`
      }
    }

    stats.count++

    return {
      allowed: true,
      remaining: effectiveQuota.maxExecutionsPerHour - stats.count
    }
  }

  /**
   * Check circuit breaker
   */
  checkCircuitBreaker(tenantId: string): { allowed: boolean; reason?: string; state: string } {
    const breaker = this.circuitBreakers.get(tenantId) || {
      failures: 0,
      lastFailure: 0,
      state: 'closed' as const
    }

    const now = Date.now()

    // Reset circuit breaker after timeout
    if (breaker.state === 'open' && now - breaker.lastFailure > this.CIRCUIT_BREAKER_TIMEOUT) {
      breaker.state = 'half-open'
      breaker.failures = 0
    }

    // Circuit is open - reject execution
    if (breaker.state === 'open') {
      return {
        allowed: false,
        reason: `Circuit breaker open due to ${breaker.failures} consecutive failures`,
        state: breaker.state
      }
    }

    return {
      allowed: true,
      state: breaker.state
    }
  }

  /**
   * Record execution result
   */
  recordExecution(tenantId: string, success: boolean): void {
    let breaker = this.circuitBreakers.get(tenantId)

    if (!breaker) {
      breaker = {
        failures: 0,
        lastFailure: 0,
        state: 'closed'
      }
      this.circuitBreakers.set(tenantId, breaker)
    }

    if (success) {
      // Reset on success
      breaker.failures = 0
      breaker.state = 'closed'
    } else {
      // Increment failures
      breaker.failures++
      breaker.lastFailure = Date.now()

      // Open circuit if threshold exceeded
      if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
        breaker.state = 'open'
      }
    }

    this.circuitBreakers.set(tenantId, breaker)
  }

  /**
   * Get execution statistics
   */
  getStats(tenantId: string): {
    executions: number
    failures: number
    circuitState: string
    quotaRemaining?: number
  } {
    const stats = this.executionStats.get(tenantId)
    const breaker = this.circuitBreakers.get(tenantId)

    return {
      executions: stats?.count || 0,
      failures: stats?.failures || 0,
      circuitState: breaker?.state || 'closed',
      quotaRemaining: stats ? this.DEFAULT_QUOTA.maxExecutionsPerHour - stats.count : this.DEFAULT_QUOTA.maxExecutionsPerHour
    }
  }

  /**
   * Reset quota (admin function)
   */
  resetQuota(tenantId: string): void {
    this.executionStats.delete(tenantId)
  }

  /**
   * Reset circuit breaker (admin function)
   */
  resetCircuitBreaker(tenantId: string): void {
    this.circuitBreakers.delete(tenantId)
  }

  /**
   * Cleanup old stats
   */
  cleanup(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [tenantId, stats] of this.executionStats.entries()) {
      if (now - stats.windowStart > this.HOUR * 2) {
        this.executionStats.delete(tenantId)
        cleaned++
      }
    }

    return cleaned
  }
}

// Singleton
let securityInstance: CodeExecutionSecurity | null = null

export function getCodeExecutionSecurity(): CodeExecutionSecurity {
  if (!securityInstance) {
    securityInstance = new CodeExecutionSecurity()
  }
  return securityInstance
}
