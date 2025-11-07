/**
 * Radar Dashboard Safety Guardrails
 *
 * Sistema robusto de segurança computável, resiliência e rastreabilidade
 *
 * Features:
 * - wrapSafe: Execução segura com try/catch automático
 * - retrySafe: Retry com backoff exponencial
 * - watchdog: Detector de spans travados
 * - code_guardrails: Validação de código antes da execução
 * - errorStore: Armazenamento de erros rastreáveis
 * - llm_safety: Validação de respostas LLM
 * - ndjson_exporter: Exportação para auditoria
 * - span_validation: Validação de spans
 */

// wrapSafe - Execution wrapper
export { wrapSafe, wrapSafeSync, wrapSafeWithSpan } from './wrapSafe'

// retrySafe - Retry logic
export { retrySafe, retryErrorRecord, retryAllRetryableErrors } from './retrySafe'

// watchdog - Span monitoring
export { Watchdog, getWatchdog, startWatchdog, stopWatchdog } from './watchdog'

// code_guardrails - Code validation
export {
  validateCode,
  sanitizeCode,
  createSafeContext,
  verifyCodeSignature,
  checkExecutionQuota,
  getDefaultConfig as getDefaultCodeGuardrailsConfig,
  updateCodeGuardrailsConfig,
  getCodeGuardrailsConfig
} from './code_guardrails'

// error_queue - Error storage
export {
  saveErrorRecord,
  getErrorByTraceId,
  getAllErrors,
  getErrorsByStatus,
  getRetryableErrors,
  updateErrorStatus,
  resolveError,
  deleteError,
  clearAllErrors,
  getErrorStats,
  getErrorsByOrigin,
  cleanupOldErrors
} from './error_queue'

// safe_llm - LLM safety
export {
  detectPromptInjection,
  validateLLMResponse,
  safeLLMCall,
  getDefaultLLMSafetyConfig
} from './safe_llm'

// ndjson_export - Audit export
export {
  exportSpansAsNDJSON,
  exportErrorsAsNDJSON,
  exportErroredSpans,
  exportLongRunningSpans,
  exportRunCodeSpans,
  exportCompliance,
  downloadNDJSON,
  parseNDJSON,
  createAuditReport
} from './ndjson_export'

// validators - Span validation
export {
  validateSpan,
  validateSpanAttributes,
  validateSpanEvents,
  validateSpanComprehensive,
  validateSpanBatch
} from './validators'

// Re-export types
export type {
  ExecutionResult,
  GuardrailViolation,
  ErrorRecord,
  RetryConfig,
  WatchdogConfig,
  CodeGuardrailsConfig,
  LLMSafetyConfig,
  SpanValidationResult
} from '@/types'
