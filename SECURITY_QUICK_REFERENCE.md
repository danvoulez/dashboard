# Radar Dashboard - Security Vulnerability Quick Reference

## Critical Vulnerabilities by Component

### 1. CODE EXECUTION (run_code.ts)
**File**: `/home/user/dashboard/src/execution/run_code.ts`
**Lines**: 351 total | Core: 36-185

**CRITICAL VULNERABILITIES**:
- ❌ Regex-based validation easily bypassed (lines 236-250)
- ❌ Function constructor allows direct code execution (line 134)
- ❌ No rate limiting or quotas
- ❌ No code origin verification
- ❌ Context object not frozen/immutable

**ATTACK SURFACE**:
```javascript
// Example bypasses:
eval = Function; eval("dangerous code")
let x = ['F','u','n','c'].join(''); new (eval(x))()
this['eval']("dangerous code")
```

**HARDENING IN PLACE**:
- ✅ Blocked globals list (37 items)
- ✅ Pattern detection (eval, Function, __proto__)
- ✅ 30-second timeout
- ✅ Span tracing

**KEY FUNCTIONS**:
- `runCode()` - CRITICAL RISK
- `createSafeContext()` - Insufficient isolation
- `validateCodeGuardrails()` - Good foundation but not used properly

---

### 2. POLICY EXECUTION (policy_agent.ts)
**File**: `/home/user/dashboard/src/execution/policy_agent.ts`
**Lines**: 358 total | Vulnerabilities: 207-279

**CRITICAL VULNERABILITIES**:
- ❌ `with` statement in Function constructor (lines 217-221)
- ❌ Direct string injection in condition evaluation
- ❌ Action code executed without sanitization (lines 263-270)
- ❌ No origin validation of policies
- ❌ Unbounded task creation from actions

**VULNERABLE CODE**:
```typescript
// Line 217-221
const evalFunction = new Function('context', `
  with (context) {
    return ${condition}  // INJECTION POINT
  }
`)

// Line 263-270
const actionFunction = new Function('ctx', `
  with (ctx) {
    return (async () => {
      ${action}  // INJECTION POINT
    })()
  }
`)
```

**TRIGGERS** (can be exploited):
- webhook.received
- task.created / task.completed
- span.error
- file.uploaded

**HARDENING IN PLACE**:
- ✅ Error handling (lines 195-201)
- ✅ Span tracing per execution
- ✅ Enable/disable toggle

**KEY FUNCTIONS**:
- `executeTrigger()` - CRITICAL
- `evaluateCondition()` - CRITICAL
- `executeAction()` - CRITICAL

---

### 3. WEBHOOK SYSTEM (webhook_receiver.ts)
**File**: `/home/user/dashboard/src/sensors/webhook_receiver.ts`
**Lines**: 346 total | Vulnerabilities: 30-55, 214-227

**CRITICAL VULNERABILITIES**:
- ❌ Secrets stored in localStorage unencrypted (lines 30-55)
- ❌ Signature verification is stubbed (lines 214-227)
  - Returns `true` if ANY header exists: `return !!signature`
  - TODO: comment admits HMAC not implemented
- ❌ No schema validation on payloads
- ❌ Auto-task creation from untrusted data
- ❌ No rate limiting

**VULNERABLE CODE**:
```typescript
// Line 214-227 - This is NOT real verification!
private verifySignature(payload: any, secret: string, signature: string): boolean {
  // This is a simplified version
  // TODO: Implement proper HMAC signature verification
  return !!signature  // ALWAYS TRUE if header exists!
}
```

**WEBHOOK PROCESSORS**:
- GitHub (lines 311-331) - Vulnerable to forgery
- Telegram (lines 333-345) - No signature verification

**HARDENING IN PLACE**:
- ✅ Event recording (all webhooks logged)
- ✅ Old event cleanup (30-day retention)
- ✅ Policy trigger integration

**KEY FUNCTIONS**:
- `receiveWebhook()` - HIGH RISK
- `verifySignature()` - CRITICAL (Not implemented!)
- `processWebhook()` - HIGH RISK

---

### 4. LLM INTEGRATION (llm-agent/client.ts)
**File**: `/home/user/dashboard/src/llm-agent/client.ts`
**Lines**: 251 total | Vulnerabilities: 54-56, 62-72, 234

**CRITICAL VULNERABILITIES**:
- ❌ API keys in HTTP headers (lines 54-56)
  ```typescript
  this.client.defaults.headers['Authorization'] = `Bearer ${config.apiKey}`
  ```
- ❌ Keys exposed in browser memory
- ❌ No key rotation/expiry mechanism
- ❌ Unsafe JSON parsing (line 234)
- ❌ No request validation
- ❌ SSRF possible via custom endpoints (lines 60, 94, 137)
- ❌ No rate limiting

**EXPOSED PROVIDERS**:
- OpenAI (gpt-4-turbo-preview) - API key required
- Ollama (llama2) - Local but unprotected
- MacMind (custom) - Custom endpoint at http://localhost:8000

**HARDENING IN PLACE**:
- ✅ Span tracing
- ✅ Token usage tracking
- ✅ Error handling
- ✅ Safe LLM wrapper (safe_llm.ts) with:
  - Prompt injection detection
  - Schema validation
  - Fallback on error

**KEY FUNCTIONS**:
- `callLLM()` - HIGH RISK (API keys, no validation)
- `callLLMWithSchema()` - HIGH RISK
- `detectPromptInjection()` - GOOD (in safe_llm.ts)
- `safeLLMCall()` - GOOD (comprehensive wrapper)

---

### 5. OBSERVER BOT (observer_bot.ts)
**File**: `/home/user/dashboard/src/execution/observer_bot.ts`
**Lines**: 264 total | Vulnerabilities: 114-131, 147-162

**CRITICAL VULNERABILITIES**:
- ❌ User-provided condition functions (line 126-127)
- ❌ Full span object accessible in conditions
- ❌ LLM called for every matching span without guardrails (line 149)
- ❌ Unbound task creation possible
- ❌ No deduplication

**DEFAULT RULES**:
1. error-span-to-task - Creates task on any error
2. long-running-span - Monitors operations > 5 min (disabled)

**HARDENING IN PLACE**:
- ✅ Rule enable/disable toggle
- ✅ 10-minute span window
- ✅ Span tracing

**KEY FUNCTIONS**:
- `executeAction()` - CRITICAL (unbounded LLM calls)
- `matchesRule()` - No validation
- `start()` - Polling mechanism

---

### 6. PLUGIN SYSTEM (plugins.ts)
**File**: `/home/user/dashboard/src/stores/plugins.ts`
**Lines**: 145 total | Vulnerabilities: 104-121, 39-43, 88

**HIGH VULNERABILITIES**:
- ❌ No plugin source validation (lines 104-121)
- ❌ Arbitrary component loading (line 84)
- ❌ No permission enforcement (declared but not enforced)
- ❌ onSpan hook unvalidated (line 88)
- ❌ onInit() runs without timeout/validation (lines 39-43)

**PLUGIN INTERFACE**:
```typescript
interface ServiceModule {
  metadata: PluginMetadata
  component: any              // Arbitrary Vue component
  onInit?: () => Promise<void> // Arbitrary code
  onSpan?: (span: Span) => void // Runs on every span
}
```

**HARDENING IN PLACE**:
- ✅ Try/catch on load (errors don't break system)
- ✅ Plugin toggle mechanism
- ✅ Span tracing

**KEY FUNCTIONS**:
- `loadPlugins()` - HIGH RISK
- `registerPlugin()` - HIGH RISK

---

## EXECUTION CHAINS & DATA FLOWS

### Dangerous Execution Path 1: Webhook → Policy → Code
```
Webhook received
  ↓
verifySignature() [STUB - always true]
  ↓
triggerPolicies("webhook.received")
  ↓
evaluateCondition() [with statement - unsafe eval]
  ↓
executeAction() [with statement - unsafe eval]
  ↓
Code execution with full task store access
```

### Dangerous Execution Path 2: Observer Bot → LLM → Task
```
Span created
  ↓
ObserverBot polls span
  ↓
Condition function called (user-provided)
  ↓
LLM call without safeLLMCall wrapper
  ↓
Auto-create task from untrusted LLM response
```

### Dangerous Execution Path 3: Policy Trigger → Cascade
```
Any trigger event
  ↓
All matching policies execute in parallel
  ↓
Each policy can create tasks, update state, call LLM
  ↓
No rate limiting, no timeout per policy
```

---

## VALIDATION & GUARDRAIL STATUS

### What's ALREADY Protected
- ✅ Code size limits (50KB)
- ✅ Blocked globals detection
- ✅ Dangerous pattern detection
- ✅ Timeout enforcement (30s default)
- ✅ Span tracing/observability
- ✅ Error retry logic (exponential backoff)
- ✅ Watchdog (detects stuck spans)
- ✅ Prompt injection detection (in safe_llm.ts)

### What's MISSING
- ❌ AST-based code analysis
- ❌ Proper HMAC signature verification
- ❌ Rate limiting (all operations)
- ❌ Request schema validation
- ❌ API key secure storage
- ❌ Plugin origin verification
- ❌ Permission enforcement
- ❌ Data access control (RLS)

---

## Quick Vulnerability Checklist

```
CODE EXECUTION:
[ ] Regex validation bypass
[ ] No rate limiting
[ ] No code origin verification
[ ] Context object mutable

POLICY EXECUTION:
[ ] with statement injection
[ ] No AST parsing
[ ] Unbounded task creation
[ ] No origin validation

WEBHOOK:
[ ] localStorage secrets
[ ] Stubbed signature verification
[ ] No payload schema validation
[ ] Untrusted data → tasks

LLM:
[ ] API keys in headers
[ ] No request validation
[ ] SSRF via endpoints
[ ] No rate limiting

OBSERVER:
[ ] Arbitrary condition functions
[ ] Unbound LLM calls
[ ] No deduplication

PLUGINS:
[ ] No source validation
[ ] No component sandboxing
[ ] Permissions not enforced
[ ] onSpan hook unvalidated
```

---

## Files Requiring Immediate Hardening

### CRITICAL (This Sprint)
1. `/home/user/dashboard/src/execution/policy_agent.ts` - Remove `with` statement
2. `/home/user/dashboard/src/sensors/webhook_receiver.ts` - Implement HMAC verification
3. `/home/user/dashboard/src/execution/run_code.ts` - AST-based validation
4. `/home/user/dashboard/src/llm-agent/client.ts` - API key management

### HIGH (Next Sprint)
1. `/home/user/dashboard/src/execution/observer_bot.ts` - Rate limiting
2. `/home/user/dashboard/src/stores/plugins.ts` - Origin verification
3. `/home/user/dashboard/src/guardrails/safe_llm.ts` - Request validation
4. `/home/user/dashboard/src/guardrails/code_guardrails.ts` - Enhance validation

---

## Reference: Blocked Globals (code_guardrails.ts)

Line 14-37: 37 items
```
window, eval, Function, fetch, XMLHttpRequest, WebSocket,
importScripts, postMessage, localStorage, sessionStorage, indexedDB,
crypto, navigator, location, document, process, global,
__dirname, __filename, require, import, module, exports,
[12 more...]
```

---

## Key Statistics

- **Total TypeScript Files**: 32
- **Execution Files**: 3 (run_code, observer_bot, policy_agent)
- **Integration Files**: 3 (webhook, llm-client, llm-agent)
- **Guardrails Files**: 7
- **CRITICAL Vulnerabilities**: 4+
- **HIGH Vulnerabilities**: 6+
- **Span Tracing Coverage**: 100% (good)
- **Rate Limiting Coverage**: 0% (bad)
- **Origin Validation Coverage**: 0% (bad)
