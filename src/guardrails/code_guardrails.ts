import type { CodeGuardrailsConfig, GuardrailViolation } from '@/types'
import { v4 as uuidv4 } from 'uuid'

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
 * Validate code before execution
 */
export function validateCode(
  code: string,
  options: {
    origin: string
    traceId: string
    spanId?: string
    config?: Partial<CodeGuardrailsConfig>
  }
): CodeValidationResult {
  const config: CodeGuardrailsConfig = {
    ...DEFAULT_CODE_GUARDRAILS_CONFIG,
    ...options.config
  }

  const violations: GuardrailViolation[] = []
  const errors: string[] = []
  const warnings: string[] = []

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

  // Check 3: Dangerous patterns (regex-based)
  const dangerousPatterns = [
    {
      pattern: /eval\s*\(/gi,
      message: 'Use of eval() is not allowed',
      severity: 'critical' as const
    },
    {
      pattern: /Function\s*\(/gi,
      message: 'Use of Function() constructor is not allowed',
      severity: 'critical' as const
    },
    {
      pattern: /new\s+Function\s*\(/gi,
      message: 'Use of new Function() is not allowed',
      severity: 'critical' as const
    },
    {
      pattern: /__proto__/gi,
      message: 'Prototype pollution attempt detected (__proto__)',
      severity: 'critical' as const
    },
    {
      pattern: /constructor\s*\[\s*["']constructor["']\s*\]/gi,
      message: 'Constructor access pattern detected',
      severity: 'high' as const
    },
    {
      pattern: /\.\s*constructor\s*\(/gi,
      message: 'Direct constructor invocation detected',
      severity: 'high' as const
    },
    {
      pattern: /(while|for)\s*\(\s*(true|1)\s*\)/gi,
      message: 'Potential infinite loop detected',
      severity: 'medium' as const
    }
  ]

  for (const { pattern, message, severity } of dangerousPatterns) {
    const matches = code.match(pattern)
    if (matches) {
      const violation: GuardrailViolation = {
        id: uuidv4(),
        type: 'code_validation',
        severity,
        message: `${message} (${matches.length} occurrences)`,
        origin: options.origin,
        traceId: options.traceId,
        spanId: options.spanId,
        timestamp: new Date().toISOString(),
        metadata: {
          pattern: pattern.source,
          occurrences: matches.length
        }
      }
      violations.push(violation)
      errors.push(violation.message)
    }
  }

  // Check 4: Comments that might hide malicious code
  const suspiciousComments = [
    /\/\*[\s\S]*?(eval|Function|import|require)[\s\S]*?\*\//gi,
    /\/\/.*?(eval|Function|import|require)/gi
  ]

  for (const pattern of suspiciousComments) {
    const matches = code.match(pattern)
    if (matches) {
      warnings.push(`Suspicious content in comments: ${matches[0].substring(0, 50)}...`)
    }
  }

  // Check 5: String concatenation that might construct dangerous code
  if (code.includes('String.fromCharCode') || code.includes('atob') || code.includes('btoa')) {
    warnings.push('String encoding/decoding detected - potential obfuscation')
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
 * Create safe execution context
 */
export function createSafeContext(baseContext: Record<string, any>): Record<string, any> {
  const safeContext: Record<string, any> = {}

  // Only copy allowed properties
  const allowedKeys = ['log', 'createTask', 'updateTask', 'getTasks', 'input', 'params']

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

  return safeContext
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
  userId: string
): { allowed: boolean; reason?: string } {
  // TODO: Implement rate limiting
  // For now, allow all executions
  return { allowed: true }
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
