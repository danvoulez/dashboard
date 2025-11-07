import type { CodeGuardrailsConfig, GuardrailViolation } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { getCodeExecutionSecurity } from '@/security/code_execution_security'

/**
 * code_guardrails - Limitações de escopo para execução segura em run_code
 *
 * Behavior:
 * - blocked_globals: ["window", "eval", "Function", "fetch"]
 * - allowed_utils: ["dayjs", "lodash"]
 * - future_signatures: true
 */

const DEFAULT_CODE_GUARDRAILS_CONFIG: CodeGuardrailsConfig = {
  blockedGlobals: [
    'window',
    'eval',
    'Function',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'importScripts',
    'postMessage',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'crypto',
    'navigator',
    'location',
    'document',
    'process',
    'global',
    '__dirname',
    '__filename',
    'require',
    'import',
    'module',
    'exports'
  ],
  allowedUtils: ['dayjs', 'lodash', '_', 'Math', 'Date', 'JSON', 'console', 'Promise'],
  maxCodeSize: 50000, // 50KB
  enableSignatureVerification: false
}

export interface CodeValidationResult {
  valid: boolean
  violations: GuardrailViolation[]
  errors: string[]
  warnings: string[]
}

/**
 * Validate code before execution (ENHANCED with token analysis)
 */
export function validateCode(
  code: string,
  options: {
    origin: string
    traceId: string
    spanId?: string
    config?: Partial<CodeGuardrailsConfig>
    tenantId?: string
  }
): CodeValidationResult {
  const config: CodeGuardrailsConfig = {
    ...DEFAULT_CODE_GUARDRAILS_CONFIG,
    ...options.config
  }

  const violations: GuardrailViolation[] = []
  const errors: string[] = []
  const warnings: string[] = []

  const security = getCodeExecutionSecurity()

  // ENHANCED: Token-based validation
  const enhancedValidation = security.validateCode(code)
  errors.push(...enhancedValidation.errors)
  warnings.push(...enhancedValidation.warnings)

  // Add violations for enhanced checks
  for (const error of enhancedValidation.errors) {
    const violation: GuardrailViolation = {
      id: uuidv4(),
      type: 'code_validation',
      severity: enhancedValidation.risk === 'critical' ? 'critical' : 'high',
      message: error,
      origin: options.origin,
      traceId: options.traceId,
      spanId: options.spanId,
      timestamp: new Date().toISOString(),
      metadata: {
        risk: enhancedValidation.risk,
        validationType: 'token-based'
      }
    }
    violations.push(violation)
  }

  // Check 1: Code size
  if (code.length > config.maxCodeSize) {
    const violation: GuardrailViolation = {
      id: uuidv4(),
      type: 'code_validation',
      severity: 'high',
      message: `Code size exceeds maximum allowed (${code.length} > ${config.maxCodeSize})`,
      origin: options.origin,
      traceId: options.traceId,
      spanId: options.spanId,
      timestamp: new Date().toISOString()
    }
    violations.push(violation)
    errors.push(violation.message)
  }

  // Check 2: Blocked globals
  for (const blockedGlobal of config.blockedGlobals) {
    const pattern = new RegExp(`\\b${escapeRegex(blockedGlobal)}\\b`, 'g')
    const matches = code.match(pattern)

    if (matches) {
      const violation: GuardrailViolation = {
        id: uuidv4(),
        type: 'code_validation',
        severity: 'critical',
        message: `Blocked global detected: ${blockedGlobal} (${matches.length} occurrences)`,
        origin: options.origin,
        traceId: options.traceId,
        spanId: options.spanId,
        timestamp: new Date().toISOString(),
        metadata: {
          blockedGlobal,
          occurrences: matches.length
        }
      }
      violations.push(violation)
      errors.push(violation.message)
    }
  }

  // Check 3: Quota check (if tenantId provided)
  if (options.tenantId) {
    const quotaCheck = security.checkQuota(options.tenantId)
    if (!quotaCheck.allowed) {
      const violation: GuardrailViolation = {
        id: uuidv4(),
        type: 'code_validation',
        severity: 'high',
        message: quotaCheck.reason || 'Quota exceeded',
        origin: options.origin,
        traceId: options.traceId,
        spanId: options.spanId,
        timestamp: new Date().toISOString(),
        metadata: {
          quotaCheck
        }
      }
      violations.push(violation)
      errors.push(violation.message)
    }

    // Check circuit breaker
    const circuitCheck = security.checkCircuitBreaker(options.tenantId)
    if (!circuitCheck.allowed) {
      const violation: GuardrailViolation = {
        id: uuidv4(),
        type: 'code_validation',
        severity: 'critical',
        message: circuitCheck.reason || 'Circuit breaker open',
        origin: options.origin,
        traceId: options.traceId,
        spanId: options.spanId,
        timestamp: new Date().toISOString(),
        metadata: {
          circuitState: circuitCheck.state
        }
      }
      violations.push(violation)
      errors.push(violation.message)
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    errors,
    warnings
  }
}

/**
 * Sanitize code (remove dangerous constructs)
 */
export function sanitizeCode(code: string): string {
  let sanitized = code

  // Remove comments (they might hide dangerous code)
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '')
  sanitized = sanitized.replace(/\/\/.*/g, '')

  // Note: This is a basic implementation
  // In production, you'd want to use a proper AST-based sanitizer

  return sanitized
}

/**
 * Create safe execution context with Proxy isolation
 */
export function createSafeContext(baseContext: Record<string, any>): Record<string, any> {
  const security = getCodeExecutionSecurity()

  // Only copy allowed properties
  const allowedKeys = ['log', 'createTask', 'updateTask', 'getTasks', 'input', 'params']

  const safeContext: Record<string, any> = {}

  for (const key of allowedKeys) {
    if (key in baseContext) {
      safeContext[key] = baseContext[key]
    }
  }

  // Add safe utilities
  safeContext.Math = Math
  safeContext.Date = Date
  safeContext.JSON = JSON
  safeContext.console = {
    log: (...args: any[]) => console.log('[Safe Context]', ...args),
    warn: (...args: any[]) => console.warn('[Safe Context]', ...args),
    error: (...args: any[]) => console.error('[Safe Context]', ...args)
  }

  // ENHANCED: Wrap with Proxy for additional security
  return security.createSecureContext(
    safeContext,
    [...allowedKeys, 'Math', 'Date', 'JSON', 'console']
  )
}

/**
 * Verify code signature (placeholder for future Ed25519 implementation)
 */
export async function verifyCodeSignature(
  code: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  // TODO: Implement Ed25519 + BLAKE3 signature verification
  // For now, return false (signatures not yet implemented)
  console.warn('Code signature verification not yet implemented')
  return false
}

/**
 * Check if code execution is allowed based on rate limits
 */
export function checkExecutionQuota(
  origin: string,
  tenantId: string
): { allowed: boolean; reason?: string; remaining?: number } {
  const security = getCodeExecutionSecurity()
  return security.checkQuota(tenantId)
}

/**
 * Record execution result for circuit breaker
 */
export function recordExecutionResult(tenantId: string, success: boolean): void {
  const security = getCodeExecutionSecurity()
  security.recordExecution(tenantId, success)
}

/**
 * Get execution statistics
 */
export function getExecutionStats(tenantId: string) {
  const security = getCodeExecutionSecurity()
  return security.getStats(tenantId)
}

/**
 * Helper: Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): CodeGuardrailsConfig {
  return { ...DEFAULT_CODE_GUARDRAILS_CONFIG }
}

/**
 * Update configuration
 */
let currentConfig = { ...DEFAULT_CODE_GUARDRAILS_CONFIG }

export function updateCodeGuardrailsConfig(config: Partial<CodeGuardrailsConfig>) {
  currentConfig = {
    ...currentConfig,
    ...config
  }
}

export function getCodeGuardrailsConfig(): CodeGuardrailsConfig {
  return { ...currentConfig }
}
