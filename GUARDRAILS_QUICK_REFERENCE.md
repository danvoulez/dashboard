# Radar Dashboard - Quick Reference Guide for Safety Guardrails

## File Structure

```
/home/user/dashboard/
├── src/
│   ├── execution/              ← PRIMARY RISK AREA
│   │   ├── run_code.ts        (Lines 1-311) - Code execution engine
│   │   ├── policy_agent.ts     (Lines 1-358) - Policy automation
│   │   └── observer_bot.ts     (Lines 1-264) - Span observation
│   │
│   ├── sensors/
│   │   └── webhook_receiver.ts (Lines 1-346) - External event handling
│   │
│   ├── llm-agent/
│   │   ├── client.ts           (Lines 1-251) - LLM provider abstraction
│   │   ├── index.ts            (Lines 1-158) - High-level LLM ops
│   │   └── prompts.ts          (Lines 1-150+) - Prompt templates
│   │
│   ├── utils/
│   │   ├── span.ts             (Lines 1-129) - Distributed tracing
│   │   ├── task.ts             (Lines 1-136) - Task utilities
│   │   └── db.ts               (Lines 1-196) - IndexedDB interface
│   │
│   ├── stores/
│   │   ├── tasks.ts            (Lines 1-216) - Task state management
│   │   ├── llm.ts              (Lines 1-150+) - LLM state
│   │   └── [others]
│   │
│   ├── types/
│   │   └── index.ts            (Lines 1-236) - Core type definitions
│   │
│   └── main.ts                 - App entry point
│
├── package.json                - Dependencies
└── vite.config.ts              - Build config
```

## Critical Code Snippets

### 1. UNSAFE CODE EXECUTION (run_code.ts:95-102)
```typescript
// BEFORE: DANGEROUS
const codeFunction = new Function('ctx', `
  with (ctx) {
    return (async () => {
      ${code}
    })()
  }
`)

// AFTER: Should include
const codeFunction = new Function('ctx', `
  "use strict";
  return (async () => {
    ${sanitizedCode}
  })()
`)
// Plus: AST analysis, rate limiting, quota checking
```

### 2. UNSAFE POLICY CONDITION (policy_agent.ts:217-223)
```typescript
// CURRENT: Unsafe
const evalFunction = new Function('context', `
  with (context) {
    return ${condition}
  }
`)

// NEEDS: Validation before construction
const errors = validatePolicyCondition(condition)
if (errors.length > 0) throw new Error(`Invalid condition: ${errors.join(', ')}`)
```

### 3. UNSAFE POLICY ACTION (policy_agent.ts:263-269)
```typescript
// CURRENT: No timeout, no rate limiting
const actionFunction = new Function('ctx', `
  with (ctx) {
    return (async () => {
      ${action}
    })()
  }
`)

// NEEDS: Timeout enforcement, rate limiting, quota tracking
const result = await executeWithTimeout(actionFunction(executionContext), 10000)
```

### 4. INSUFFICIENT WEBHOOK VALIDATION (webhook_receiver.ts:105-110)
```typescript
// CURRENT: Stub implementation
if (config.secret) {
  const signature = headers['x-webhook-signature'] || headers['x-hub-signature-256']
  if (!signature || !this.verifySignature(payload, config.secret, signature)) {
    throw new Error('Invalid webhook signature')
  }
}

// NEEDS: Proper HMAC verification
const crypto = require('crypto')
const hash = crypto.createHmac('sha256', config.secret)
  .update(JSON.stringify(payload))
  .digest('hex')
if (hash !== signature) throw new Error('Invalid signature')
```

### 5. UNVALIDATED LLM CALLS (llm-agent/client.ts:59-86)
```typescript
// CURRENT: No input validation
const payload: any = {
  model: this.config.model || 'gpt-4-turbo-preview',
  messages: options.messages,
  temperature: options.temperature ?? 0.7,
  max_tokens: options.maxTokens ?? 2000
}

// NEEDS: Input sanitization, token limits, prompt injection detection
validateInputTokens(options.messages)
detectPromptInjection(options.messages)
enforceTokenLimit(options.maxTokens, this.config.provider)
```

## Risk Assessment Matrix

| Component | Risk | Issue | Impact | Priority |
|-----------|------|-------|--------|----------|
| run_code.ts | CRITICAL | No AST analysis | Code injection, data theft | P0 |
| run_code.ts | CRITICAL | No resource limits | DOS, crash | P0 |
| run_code.ts | HIGH | No rate limiting | Abuse, DOS | P0 |
| policy_agent.ts | CRITICAL | No sandboxing | Infinite loops, abuse | P0 |
| policy_agent.ts | HIGH | No circular detection | Resource exhaustion | P1 |
| observer_bot.ts | HIGH | Unbounded task creation | DOS, spam | P1 |
| webhook_receiver.ts | HIGH | Stub verification | Unauthorized events | P1 |
| webhook_receiver.ts | HIGH | No payload validation | Injection attacks | P1 |
| llm-agent/client.ts | HIGH | No injection detection | Prompt hijacking | P1 |
| llm-agent/client.ts | MEDIUM | API key exposure | Credential leak | P1 |
| IndexedDB | MEDIUM | Unencrypted data | Data leakage | P2 |

## Recommended Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Create `/src/guardrails/` directory structure
- [ ] Implement `RateLimiter` service (time-window based)
- [ ] Implement `AuditLogger` service
- [ ] Extend span types for guardrail tracking
- [ ] Add guardrail error types

### Phase 2: Code Execution Safety (Week 2)
- [ ] Implement `ExecutionGuardrails` with AST analysis
- [ ] Update `run_code.ts` validation and execution
- [ ] Add execution quotas (per-user, per-hour)
- [ ] Add resource limits tracking
- [ ] Integrate audit logging

### Phase 3: Policy Safety (Week 3)
- [ ] Implement `PolicyGuardrails` validator
- [ ] Update `policy_agent.ts` condition/action validation
- [ ] Add circular dependency detection
- [ ] Implement execution timeouts
- [ ] Add execution history limits

### Phase 4: External Safety (Week 4)
- [ ] Implement `WebhookGuardrails`
- [ ] Update webhook signature verification
- [ ] Add payload validation and size limits
- [ ] Add webhook rate limiting
- [ ] Implement event TTL management

### Phase 5: LLM Safety (Week 4-5)
- [ ] Implement `LLMGuardrails`
- [ ] Add prompt injection detection
- [ ] Add token limit enforcement
- [ ] Implement LLM rate limiting
- [ ] Add response validation

### Phase 6: Monitoring (Week 5-6)
- [ ] Create error dashboard
- [ ] Implement compliance reporting
- [ ] Add metrics and alerting
- [ ] Create guardrails config UI

## Integration Checklist

### run_code.ts (Execution Module)
- [ ] Line 44-51: Add guardrail span attributes
- [ ] Line 95: Add AST analysis before Function construction
- [ ] Line 96-102: Sanitize code string
- [ ] Line 106: Enforce max timeout from config
- [ ] Line 119: Track execution metrics in attributes

### policy_agent.ts (Policy Module)
- [ ] Line 128-130: Validate policies before execution
- [ ] Line 175: Call guardrail validator for condition
- [ ] Line 185: Call guardrail validator for action
- [ ] Line 217: Add condition validation
- [ ] Line 263: Add action validation with timeout

### observer_bot.ts (Observer Module)
- [ ] Line 78: Add guardrail tracking span
- [ ] Line 94-102: Add rule validation and rate limiting
- [ ] Line 97-100: Validate rule before matching
- [ ] Line 148-163: Cap task creation per rule
- [ ] Line 137-141: Track action metadata

### webhook_receiver.ts (Webhook Module)
- [ ] Line 81-102: Validate webhook config
- [ ] Line 105-110: Implement real HMAC verification
- [ ] Line 113-121: Add payload schema validation
- [ ] Line 150-163: Validate extracted task data
- [ ] Add size limits and rate limiting

### llm-agent/client.ts (LLM Module)
- [ ] Line 59-86: Add input sanitization
- [ ] Line 74-85: Add response validation
- [ ] Line 174-219: Add rate limiting
- [ ] Line 189-210: Add prompt injection detection
- [ ] Track token usage for limits

### types/index.ts (Type System)
- [ ] Add `GuardRailViolation` type
- [ ] Add `ExecutionMetrics` to Span attributes
- [ ] Add `GuardRailCheckResult` type
- [ ] Extend `Policy` with validation schema

### db.ts (Database)
- [ ] Add `errors` object store
- [ ] Add `auditLog` object store
- [ ] Add `rateLimit` object store (optional)
- [ ] Create indexes: by-timestamp, by-severity

## Key Metrics to Track

```typescript
interface ExecutionMetrics {
  // Code execution
  codeExecutionCount: number
  codeExecutionTimeTotal: number
  codeExecutionErrors: number
  
  // Policy execution
  policyExecutionCount: number
  policyExecutionErrors: number
  policyCircularDependencies: number
  
  // Observer bot
  observerRulesTriggered: number
  tasksCreatedFromObserver: number
  
  // Webhooks
  webhooksReceived: number
  webhooksProcessed: number
  webhooksRejected: number
  
  // LLM
  llmCallsTotal: number
  llmTokensUsed: number
  llmPromptInjections: number
  
  // Overall
  guardrailViolations: number
  auditLogsCreated: number
}
```

## Testing Strategy

### Unit Tests Needed
- [ ] ExecutionGuardrails AST analysis
- [ ] PolicyGuardrails circular dependency detection
- [ ] WebhookGuardrails signature verification
- [ ] LLMGuardrails prompt injection detection
- [ ] RateLimiter window calculations

### Integration Tests Needed
- [ ] Code execution with guardrails
- [ ] Policy execution with guardrails
- [ ] Webhook reception with guardrails
- [ ] LLM calls with guardrails
- [ ] Audit logging across all components

### Security Tests Needed
- [ ] Bypassing code validation
- [ ] DOS through rate limit evasion
- [ ] Prompt injection techniques
- [ ] Webhook signature spoofing
- [ ] Circular dependency exploits

## Configuration Defaults Recommended

```typescript
// Execution limits
MAX_CODE_EXECUTION_TIME = 30_000 // ms
MAX_POLICY_ACTION_TIME = 10_000 // ms
MAX_CODE_SIZE = 50_000 // bytes

// Rate limits
CODE_EXECUTIONS_PER_HOUR = 100
POLICIES_TRIGGERED_PER_HOUR = 1000
WEBHOOKS_PER_MINUTE = 60
LLM_CALLS_PER_MINUTE = 30

// Quotas
MAX_CONCURRENT_EXECUTIONS = 5
MAX_TASKS_FROM_OBSERVER_PER_DAY = 100
MAX_POLICIES_PER_USER = 100

// Sizes
MAX_WEBHOOK_PAYLOAD_SIZE = 10_000_000 // 10MB
MAX_CODE_SIZE = 50_000 // bytes
MAX_POLICY_SIZE = 10_000 // bytes

// Timeouts
LLM_CALL_TIMEOUT = 60_000 // ms
WEBHOOK_PROCESSING_TIMEOUT = 30_000 // ms
```

## Documentation to Create

1. **Safety Guardrails Architecture Guide** - High-level design
2. **Guardrails API Reference** - Function signatures and behavior
3. **Configuration Guide** - Adjusting limits and thresholds
4. **Audit Log Format** - Logging structure and fields
5. **Error Handling Guide** - Error types and recovery
6. **Compliance Report Template** - For audit purposes

## Success Criteria

- [ ] All code execution goes through AST validation
- [ ] All policies are validated before execution
- [ ] All webhooks are properly verified
- [ ] All LLM prompts are checked for injection
- [ ] Rate limiting is enforced on all operations
- [ ] Comprehensive audit logging is enabled
- [ ] Zero unhandled execution errors
- [ ] <5% false positive rate on guardrail checks
- [ ] <100ms overhead per guardrail check
- [ ] 100% test coverage for guardrails module

