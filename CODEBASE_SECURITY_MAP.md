# Radar Dashboard - Comprehensive Codebase Security Analysis

**Analysis Date**: 2025-11-07  
**Repository**: /home/user/dashboard  
**Total TypeScript Files**: 32  
**Status**: Security assessment for hardening phase  

---

## EXECUTIVE SUMMARY

The Radar Dashboard is a Vue 3 PWA with sophisticated automation capabilities including code execution, webhook handling, LLM integration, and policy-based automation. While some basic guardrails exist (code validation, retry logic, watchdog monitoring), **critical security vulnerabilities exist across all execution systems**.

### Critical Findings
1. **Code Execution** (run_code.ts): Function constructor + regex validation is bypassable
2. **Policy Execution** (policy_agent.ts): Uses `with` statement for dynamic code evaluation
3. **Webhook Processing** (webhook_receiver.ts): Signature verification is stubbed/incomplete
4. **LLM Integration** (llm-agent/client.ts): API keys exposed in plain client requests
5. **Plugin System** (plugins.ts): Minimal validation of plugin origins/contents

---

## SECTION 1: EXECUTION SYSTEM (run_code.ts)

### Location
`/home/user/dashboard/src/execution/run_code.ts` (351 lines)

### Current Implementation

**Architecture**:
- Uses `Function` constructor to create executable code (line 134)
- Wraps code in `"use strict"` mode
- Implements 30-second timeout (configurable)
- Creates safe context via `createSafeContext()` from code_guardrails

**Code Validation** (lines 57-79):
```typescript
- Validates code using validateCodeGuardrails()
- Checks for banned globals, dangerous patterns, suspicious comments
- Tracks violations with traceId/spanId
- Supports code size limits (50KB default)
```

**Available Context**:
```typescript
{
  taskStore, uploadStore, llmStore,      // Store access
  createTask, updateTask, getTasks,       // Task management
  log,                                    // Logging
  input, params                           // Data passing
}
```

**Predefined Scripts** (lines 262-340):
1. `prioritize_tasks` - Task priority recalculation
2. `create_daily_summary` - Daily summary generation
3. `cleanup_completed` - Archive old completed tasks

### Security Vulnerabilities

#### CRITICAL Issues

1. **Regex-Based Validation Bypass** (Line 236-250)
   - Pattern-matching validation is easily circumvented
   - Examples of bypasses:
     ```javascript
     // These pass validation but execute arbitrary code:
     eval = Function; eval('dangerous code')           // Rename aliasing
     let f = ['F','u','n','c','t','i','o','n'].join(''); new (eval(f))()
     this['eval']('dangerous code')                     // Property access
     Object.getOwnPropertyNames(window).map(x => eval(x))
     ```

2. **Function Constructor + with Statement** (Line 134)
   - Creates code function with `with` statement (removed in line 135's comment, but still vulnerable)
   - Allows object injection attacks
   - Context object is fully accessible via `with` statement scope

3. **Unsafe Context Exposure** (Line 131)
   - `createSafeContext()` only limits keys but doesn't freeze context
   - Properties can be mutated: `context.createTask = maliciousFn`
   - Task store has unvalidated access to all data

4. **No Rate Limiting/Quotas** (Lines 142-149)
   - Default 30-second timeout is configurable to unlimited
   - No per-user execution count limits
   - No memory/CPU resource constraints
   - Can execute resource-intensive infinite loops

5. **No Code Origin Verification** (Lines 36-43)
   - No signature verification before execution
   - `verifyCodeSignature()` in code_guardrails.ts returns false (line 254)
   - No audit trail of code origin

### Hardening Already In Place

1. **Code Guardrails Module** (/guardrails/code_guardrails.ts)
   - Blocked globals list (37 items)
   - Dangerous pattern detection (eval, Function, __proto__, etc.)
   - Infinite loop detection (while/for true detection)
   - Code size limits (50KB)

2. **Timeout Protection** (Line 143)
   - Promise.race implementation prevents infinite execution
   - Configurable up to 600000ms

3. **Span Tracing** (Lines 45-87)
   - Full execution traced with spanId/traceId
   - Validation results recorded
   - Duration and result type tracked

### Key Functions

| Function | Purpose | Risk |
|----------|---------|------|
| `runCode()` | Main execution entry | CRITICAL |
| `validateCode()` | Basic pattern validation | Bypassable |
| `executeWithTimeout()` | Promise timeout wrapper | Adequate |
| `validateCodeGuardrails()` | Comprehensive validation | Good foundation |
| `createSafeContext()` | Context limiting | Insufficient |

---

## SECTION 2: AUTOMATION SYSTEMS

### 2A: OBSERVER BOT (observer_bot.ts)

**Location**: `/home/user/dashboard/src/execution/observer_bot.ts` (264 lines)

#### Current Implementation

**Architecture**:
- Polls spans every 5 seconds (configurable)
- Matches spans using name patterns (string or RegExp)
- Evaluates optional condition functions
- Triggers actions: create_task, trigger_policy, notify, custom

**Execution Flow**:
1. `start(intervalMs)` - Start polling loop (line 34)
2. `checkSpans()` - Get recent spans < 10 minutes old (line 77)
3. `matchesRule()` - Pattern match + optional condition (line 114)
4. `executeAction()` - Trigger LLM or custom action (line 136)

**Default Rules** (Lines 202-233):
1. **error-span-to-task**
   - Triggers: Any span with status='error'
   - Action: LLM generates task from span

2. **long-running-span**
   - Triggers: Operations > 5 minutes
   - Action: Create review task (disabled by default)

#### Security Vulnerabilities

##### CRITICAL Issues

1. **User-Provided Condition Functions** (Line 126-127)
   - Rule condition is direct function call with full span access
   - Attackers can define rules with malicious conditions
   - No validation/sandboxing of condition logic

2. **Unbound Task Creation** (Line 147-162)
   - LLM can be called for every matching span
   - No rate limiting on task creation
   - Can flood system with auto-generated tasks
   - No deduplication logic

3. **LLM Called Without Guardrails** (Line 149)
   ```typescript
   const taskData = await llmAgent.generateTaskFromSpan(span)
   // No safeLLMCall wrapper, no validation
   ```

4. **Span Object Fully Exposed** (Line 97)
   - Condition function receives entire span object
   - Can access sensitive metadata, trace IDs, user data

#### Hardening In Place

1. **Rule Enable/Disable Toggle** (Line 95)
   - Can disable rules dynamically
2. **Span Time Window** (Lines 83-86)
   - Only checks spans < 10 minutes old
3. **Tracing** (Lines 78, 88, 104)
   - Records rule matches and triggers in spans

#### Key Functions

| Function | Purpose | Risk |
|----------|---------|------|
| `start()` | Begin observation | Medium |
| `checkSpans()` | Get and filter spans | Medium |
| `matchesRule()` | Pattern matching | Medium |
| `executeAction()` | Trigger automation | CRITICAL |
| `getRules()` | Get current rules | Low |

---

### 2B: POLICY AGENT (policy_agent.ts)

**Location**: `/home/user/dashboard/src/execution/policy_agent.ts` (358 lines)

#### Current Implementation

**Policy Structure** (Lines 125-138):
```typescript
interface Policy {
  id: string
  name: string
  trigger: string                // e.g., "webhook.received"
  condition: string              // JavaScript expression
  action: string                 // JavaScript code
  enabled: boolean
  spanIds: string[]              // execution history
}
```

**Execution Flow**:
1. `executeTrigger(trigger, event)` - Match policies by trigger (line 121)
2. `evaluateCondition()` - Use Function constructor (line 217)
3. `executeAction()` - Execute policy action code (line 262)

**Available Functions in Actions**:
- `createTask()` - Create task with metadata
- `updateTask()` - Update existing task
- `log()` - Add event to span

#### Security Vulnerabilities

##### CRITICAL Issues

1. **Dynamic Code Evaluation with `with` Statement** (Lines 217-221)
   ```typescript
   const evalFunction = new Function('context', `
     with (context) {
       return ${condition}
     }
   `)
   ```
   - Completely vulnerable to injection attacks
   - `with` statement creates indirect eval
   - No AST/parsing of condition

2. **Action Code Executed Dynamically** (Lines 263-270)
   ```typescript
   const actionFunction = new Function('ctx', `
     with (ctx) {
       return (async () => {
         ${action}
       })()
     }
   `)
   ```
   - Same vulnerability pattern
   - User-provided code directly injected
   - No sanitization

3. **No Origin Validation** (Lines 40-50)
   - Policies created without validation of creator
   - No permission checks on execution trigger

4. **Unbounded Action Execution** (Line 142-145)
   - All matching policies execute synchronously
   - No limit on policies per trigger
   - No timeout on action execution

5. **Task Store Access Without Limits** (Lines 244-255)
   - Actions can create unlimited tasks
   - No rate limiting
   - No validation of task data

#### Hardening In Place

1. **Span Tracing** (Lines 40-43, 122-125)
   - Each policy execution creates child spans
   - Traces condition evaluation and action execution
2. **Error Handling** (Lines 195-201)
   - Catches execution errors
   - Records in spans
3. **Enable/Disable Toggle** (Line 299)
   - Can disable policies

#### Key Functions

| Function | Purpose | Risk |
|----------|---------|------|
| `createPolicy()` | Create new policy | Medium |
| `updatePolicy()` | Update policy | Medium |
| `executeTrigger()` | Match and execute | CRITICAL |
| `evaluateCondition()` | Dynamic evaluation | CRITICAL |
| `executeAction()` | Execute action code | CRITICAL |

#### Common Policy Triggers

```typescript
FILE_UPLOADED: 'file.uploaded'
TASK_CREATED: 'task.created'
TASK_COMPLETED: 'task.completed'
WEBHOOK_RECEIVED: 'webhook.received'
SPAN_ERROR: 'span.error'
FOCUS_STARTED: 'focus.started'
FOCUS_ENDED: 'focus.ended'
DAILY_SUMMARY: 'daily.summary'
```

---

## SECTION 3: WEBHOOK SYSTEM (webhook_receiver.ts)

**Location**: `/home/user/dashboard/src/sensors/webhook_receiver.ts` (346 lines)

### Current Implementation

**Architecture**:
- Receives webhooks via `receiveWebhook(webhookId, payload, headers)`
- Stores configs in localStorage (CRITICAL: not secure)
- Optional auto-task creation from webhooks
- Policy trigger support

**Webhook Config**:
```typescript
interface WebhookConfig {
  id: string
  name: string
  secret?: string
  enabled: boolean
  autoCreateTask?: boolean
  policyTrigger?: string
}
```

**Processing Flow** (Lines 81-137):
1. Load webhook config (line 95)
2. Verify signature (line 106)
3. Create event record (line 113)
4. Process webhook (line 127)
5. Mark as processed (line 129)

### Security Vulnerabilities

#### CRITICAL Issues

1. **Credentials Stored in localStorage** (Lines 30-38, 53-55)
   - Webhook secrets stored unencrypted in browser
   - localStorage accessible to XSS attacks
   - No secure key storage mechanism

2. **Stub Signature Verification** (Lines 214-227)
   ```typescript
   private verifySignature(payload: any, secret: string, signature: string): boolean {
     // This is a simplified version
     // TODO: Implement proper HMAC signature verification
     return !!signature  // Only checks if signature exists!
   }
   ```
   - Returns true if ANY signature header exists
   - No actual HMAC verification
   - GitHub webhooks vulnerable to forgery

3. **Arbitrary Payload Extraction** (Lines 183-209)
   - Heuristic extraction of fields (title, subject, name, etc.)
   - No schema validation
   - Payloads directly create tasks without sanitization

4. **Auto-Task Creation Without Rate Limiting** (Lines 148-166)
   - Every webhook can create task
   - No deduplication
   - Untrusted webhook content becomes tasks

5. **No Origin Validation** (Line 268)
   - Webhook URL generated as `/api/webhooks/{webhookId}`
   - No TLS/HTTPS enforcement mentioned
   - CORS not configured

#### Hardening In Place

1. **Event Recording** (Lines 113-121)
   - All webhooks logged as events
   - Stores headers and payload
2. **Policy Trigger Integration** (Lines 169-177)
   - Can route webhooks to policy triggers
3. **Event History** (Lines 232-248)
   - Can retrieve and filter events
4. **Old Event Cleanup** (Lines 274-279)
   - Clears events older than 30 days

### Key Functions

| Function | Purpose | Risk |
|----------|---------|------|
| `receiveWebhook()` | Main entry point | HIGH |
| `processWebhook()` | Process incoming webhook | HIGH |
| `verifySignature()` | Signature verification | CRITICAL |
| `extractTaskTitle()` | Parse webhook payload | HIGH |
| `registerWebhook()` | Register new webhook | MEDIUM |

---

## SECTION 4: LLM INTEGRATION (llm-agent/client.ts)

**Location**: `/home/user/dashboard/src/llm-agent/client.ts` (251 lines)

### Current Implementation

**Architecture**:
- Factory pattern for multiple LLM providers
- Support for: OpenAI, Ollama, MacMind
- Axios-based HTTP client
- Tracing via spans

**Client Implementations**:
1. **OpenAIClient** (Lines 51-86)
   - Uses OpenAI API key directly
   - Supports gpt-4-turbo-preview, JSON mode
   
2. **OllamaClient** (Lines 92-129)
   - Local model support (llama2)
   - Custom prompt format
   
3. **MacMindClient** (Lines 135-152)
   - Custom endpoint at http://localhost:8000

**High-Level Interface** (Lines 174-219):
```typescript
callLLM() - Direct call with tracing
callLLMWithSchema() - JSON parsing + schema validation
streamLLM() - Streaming (not yet implemented)
```

### Security Vulnerabilities

#### CRITICAL Issues

1. **API Keys in Client Code** (Lines 54-56)
   ```typescript
   if (config.apiKey) {
     this.client.defaults.headers['Authorization'] = `Bearer ${config.apiKey}`
   }
   ```
   - API keys passed via HTTP headers
   - Exposed in browser memory
   - No key rotation or expiry
   - Keys stored in LLM store (useLLMStore)

2. **No Request Validation** (Lines 62-72)
   - Payload directly from options without sanitization
   - Message content not validated
   - Temperature/tokens not bounded

3. **Unsafe JSON Parsing** (Lines 234)
   ```typescript
   try {
     return JSON.parse(result.content)
   } catch (error) {
     throw new Error(`Failed to parse LLM response: ${error}`)
   }
   ```
   - No schema validation before parsing
   - LLM response treated as trusted

4. **No Rate Limiting** (Lines 174-219)
   - Unlimited API calls possible
   - No cost tracking
   - No quota enforcement

5. **Endpoint Configuration Vulnerability** (Lines 60, 94, 137)
   - Custom endpoints configurable at runtime
   - No URL validation/allowlisting
   - SSRF possible if endpoint is user-provided

#### Hardening In Place

1. **Span Tracing** (Lines 178-187, 199-202)
   - Logs LLM calls with model/provider/message count
   - Tracks token usage when available
2. **Error Handling** (Lines 212-218)
   - Wraps errors in spans
   - Proper error messages

### Safe LLM Wrapper (safe_llm.ts)

**Location**: `/home/user/dashboard/src/guardrails/safe_llm.ts` (378 lines)

**Protections**:
1. **Prompt Injection Detection** (Lines 33-134)
   - Detects "ignore instructions", "act as", role override attempts
   - Checks for HTML comments, script tags
   - Detects zero-width characters

2. **Response Schema Validation** (Lines 139-215)
   - Basic JSON schema validation
   - Property type checking
   - Required field validation

3. **Retry Logic** (Lines 281-287)
   - Wraps LLM calls with retrySafe
   - Fallback on error support

4. **Fallback Handling** (Lines 321-327)
   - Can gracefully handle failures
   - Returns undefined instead of error

### Key Functions

| Function | Purpose | Risk |
|----------|---------|------|
| `createLLMClient()` | Factory | MEDIUM |
| `callLLM()` | LLM call | HIGH |
| `callLLMWithSchema()` | Schema validation | HIGH |
| `detectPromptInjection()` | Injection detection | Good |
| `safeLLMCall()` | Safe wrapper | Good |

---

## SECTION 5: OBSERVABILITY (ndjson_export.ts)

**Location**: `/home/user/dashboard/src/guardrails/ndjson_export.ts` (307 lines)

### Current Implementation

**Export Functions**:
1. `exportSpansAsNDJSON()` - Export with filters
2. `exportErrorsAsNDJSON()` - Error log export
3. `exportErroredSpans()` - Filter by error status
4. `exportLongRunningSpans()` - Performance diagnostics
5. `exportRunCodeSpans()` - Execution audit
6. `exportCompliance()` - Full audit report

**Filtering Capabilities** (Lines 11-25):
- By status (ok/error/pending)
- By span name or pattern
- By duration (min/max milliseconds)
- By date range
- Include/exclude attributes and events

**Output Format** (Lines 83-105):
```typescript
// NDJSON (newline-delimited JSON)
{
  id, traceId, parentSpanId, name, kind,
  startTime, endTime, status, userId,
  attributes, events
}
```

### Security Considerations

#### Potential Issues

1. **Data Exposure in Exports** (Lines 96-102)
   - Includes full span attributes
   - Includes all span events
   - May contain sensitive metadata
   - No data redaction/masking

2. **No Access Control** (Lines 30-32)
   - Any code can export any spans
   - No permission checks
   - No audit trail of exports

3. **Client-Side Only** (Line 245)
   ```typescript
   export function downloadNDJSON(ndjson: string, filename: string)
   ```
   - Exports via browser API
   - No server-side compliance controls

#### Hardening In Place

1. **Date Range Filtering** (Lines 64-70)
   - Can limit exports to specific periods
2. **Pagination** (Lines 74-80)
   - Offset/limit support prevents memory exhaustion
3. **NDJSON Format** (Line 107)
   - Standard format for log streaming
4. **Audit Report** (Lines 270-306)
   - Comprehensive audit summary
   - Includes error statistics

### Key Functions

| Function | Purpose | Risk |
|----------|---------|------|
| `exportSpansAsNDJSON()` | Main export | MEDIUM |
| `exportCompliance()` | Audit export | MEDIUM |
| `downloadNDJSON()` | Download trigger | LOW |
| `parseNDJSON()` | Import parsing | LOW |
| `createAuditReport()` | Report generation | LOW |

---

## SECTION 6: PLUGIN SYSTEM (plugins.ts)

**Location**: `/home/user/dashboard/src/stores/plugins.ts` (145 lines)

### Current Implementation

**Architecture**:
- Pinia store for plugin management
- Dynamic imports via `import.meta.glob()`
- Metadata-based permissions and configuration

**Plugin Interface** (Types from index.ts):
```typescript
interface ServiceModule {
  metadata: PluginMetadata
  component: any           // Vue component
  config: any
  store?: any
  onInit?: () => Promise<void>
  onSpan?: (span: Span) => Promise<void>
}

interface PluginMetadata {
  id: string
  title: string
  icon: string
  route: string
  permissions: PluginPermission[]  // 'view' | 'edit' | 'delete'
  enabled: boolean
}
```

**Plugin Lifecycle** (Lines 19-51):
1. `registerPlugin()` - Register new plugin
2. `onInit()` - Run plugin initialization if provided
3. `togglePlugin()` - Enable/disable plugin
4. `unregisterPlugin()` - Remove plugin

**Dynamic Loading** (Lines 104-131):
```typescript
const pluginModules = import.meta.glob('@/services/*/index.ts')

for (const path in pluginModules) {
  try {
    const module = await pluginModules[path]() as { default: ServiceModule }
    await registerPlugin(module.default)
  } catch (error) {
    console.error(`Failed to load plugin from ${path}:`, error)
  }
}
```

### Security Vulnerabilities

#### HIGH Issues

1. **No Plugin Source Validation** (Lines 104-121)
   - Dynamic imports from @/services/** without verification
   - No origin checks on plugin code
   - No signature verification of plugins

2. **Arbitrary Component Loading** (Line 84)
   ```typescript
   component: any  // Vue component
   ```
   - Components can render any content
   - No sandboxing of component execution
   - XSS vectors possible

3. **No Permission Enforcement** (Line 78-79)
   - Metadata permissions stored but not enforced
   - Plugins can access more than declared
   - No runtime permission checks

4. **onSpan Hook Unvalidated** (Line 88)
   ```typescript
   onSpan?: (span: Span) => Promise<void>
   ```
   - Arbitrary code execution on every span
   - No limits on hook duration
   - Can modify/leak span data

5. **Initialization Without Validation** (Lines 39-43)
   - onInit() can execute any code
   - No timeout or error recovery
   - Plugin failures can break dashboard

#### Hardening In Place

1. **Registration Validation** (Lines 27-33)
   - Checks plugin has id
   - Prevents duplicate registration
2. **Try/Catch on Load** (Lines 114-120)
   - Errors don't break plugin loading
   - Failures logged
3. **Toggle Mechanism** (Lines 74-94)
   - Can disable malfunctioning plugins
4. **Span Tracing** (Lines 20-22, 54-56, 75-77)
   - All plugin operations traced

### Key Functions

| Function | Purpose | Risk |
|----------|---------|------|
| `registerPlugin()` | Register plugin | HIGH |
| `loadPlugins()` | Dynamic loading | HIGH |
| `togglePlugin()` | Enable/disable | MEDIUM |
| `getPlugin()` | Get by ID | LOW |
| `unregisterPlugin()` | Unregister | MEDIUM |

---

## SECTION 7: SECURITY INFRASTRUCTURE

### Available Guardrails (in /guardrails)

**1. Code Guardrails (code_guardrails.ts - 299 lines)**
- Blocked globals (37 items)
- Dangerous pattern detection
- Code size limits
- Safe context creation
- Placeholder for signature verification

**2. Safe LLM (safe_llm.ts - 378 lines)**
- Prompt injection detection
- Schema validation
- Retry wrapper
- Fallback on error

**3. Error Handling (error_queue.ts)**
- IndexedDB error storage
- Error deduplication by traceId
- Retry count tracking
- Status workflow (pending → retrying → failed/resolved)

**4. Retry Logic (retrySafe.ts)**
- Exponential backoff
- Configurable attempt count
- Span tracing
- Metadata preservation

**5. Watchdog (watchdog.ts)**
- Detects stuck spans (pending > threshold)
- Monitors long-running operations
- Marks as error or triggers retry
- 5-minute default check interval

**6. Export/Audit (ndjson_export.ts)**
- NDJSON export format
- Flexible filtering
- Compliance report generation
- Audit trail support

---

## SECURITY VULNERABILITIES SUMMARY

### CRITICAL (Exploit-Ready)

1. **Code Execution via regex bypass** - run_code.ts
2. **Dynamic code evaluation with `with`** - policy_agent.ts
3. **Webhook signature verification stub** - webhook_receiver.ts
4. **API keys in browser/localStorage** - llm-agent/client.ts, webhook_receiver.ts

### HIGH (Easily Exploitable)

1. **Unvalidated LLM response parsing** - llm-agent/client.ts
2. **Unbound task creation from spans** - observer_bot.ts
3. **No rate limiting on execution** - run_code.ts, policy_agent.ts
4. **Plugin origin validation missing** - plugins.ts
5. **Policy trigger execution without origin check** - policy_agent.ts
6. **SSRF via custom LLM endpoints** - llm-agent/client.ts

### MEDIUM (Requires Setup)

1. **Webhook payloads as untrusted input** - webhook_receiver.ts
2. **Span data fully exposed in exports** - ndjson_export.ts
3. **Plugin permissions declared but not enforced** - plugins.ts
4. **No access control on exports** - ndjson_export.ts

### LOW (Defense-in-Depth)

1. **Timeout is configurable/removable** - run_code.ts
2. **Limited AST-based validation** - code_guardrails.ts

---

## HARDENING STATUS BY COMPONENT

| Component | Validation | Rate Limiting | Origin Check | Error Handling | Audit Trail |
|-----------|-----------|-----------------|--------------|-----------------|-------------|
| run_code | ✅ Partial | ❌ None | ❌ None | ✅ Spans | ✅ Spans |
| observer_bot | ❌ None | ❌ None | ❌ None | ✅ Spans | ✅ Spans |
| policy_agent | ❌ None | ❌ None | ❌ None | ✅ Spans | ✅ Spans |
| webhook | ⚠️ Stubbed | ❌ None | ❌ None | ✅ Events | ✅ Events |
| llm | ✅ Good | ❌ None | ❌ None | ✅ Spans | ✅ Spans |
| plugin | ❌ None | ❌ None | ❌ None | ✅ Spans | ✅ Spans |

---

## CRITICAL PATHS REQUIRING HARDENING

### Execution Chain
```
User Input → Policy/Webhook → LLM Call → Code Execution → Store Access
```

**Vulnerable At**:
- Policy condition evaluation (no AST)
- Webhook payload parsing (heuristic)
- LLM response validation (minimal)
- Code execution (regex validation)
- Store access (no permission checks)

### Data Flow
```
External System → Webhook → Observer → LLM → Task Creation → Database
```

**Data Exposure At**:
- Webhook signature verification
- Event logging (includes full payload)
- Export functions (no redaction)
- Error logs (includes span data)

---

## FILE MANIFEST

### Execution
- `/home/user/dashboard/src/execution/run_code.ts` - Code execution engine
- `/home/user/dashboard/src/execution/observer_bot.ts` - Span observation
- `/home/user/dashboard/src/execution/policy_agent.ts` - Policy automation

### Integration
- `/home/user/dashboard/src/sensors/webhook_receiver.ts` - Webhook handling
- `/home/user/dashboard/src/llm-agent/client.ts` - LLM client
- `/home/user/dashboard/src/llm-agent/index.ts` - LLM agent interface

### Guardrails
- `/home/user/dashboard/src/guardrails/code_guardrails.ts` - Code validation
- `/home/user/dashboard/src/guardrails/safe_llm.ts` - LLM safety
- `/home/user/dashboard/src/guardrails/error_queue.ts` - Error storage
- `/home/user/dashboard/src/guardrails/retrySafe.ts` - Retry logic
- `/home/user/dashboard/src/guardrails/watchdog.ts` - Stuck span detection
- `/home/user/dashboard/src/guardrails/ndjson_export.ts` - Audit export
- `/home/user/dashboard/src/guardrails/index.ts` - Guardrails index

### Plugins & Store
- `/home/user/dashboard/src/stores/plugins.ts` - Plugin system
- `/home/user/dashboard/src/types/index.ts` - Type definitions

### Types & Interfaces
- All types defined in `/home/user/dashboard/src/types/index.ts`
- Policy, Span, Task, ErrorRecord, GuardrailViolation

---

## RECOMMENDED HARDENING PRIORITIES

### Phase 1: Critical Fixes (This Branch)
1. AST-based code validation (not regex)
2. Proper webhook signature verification (HMAC-SHA256)
3. Remove `with` statement from policy evaluation
4. Implement rate limiting on all operations
5. API key management (rotation, secure storage)

### Phase 2: Medium-Term
1. Plugin origin verification + sandboxing
2. Permission enforcement system
3. Data access control (RLS)
4. Export data redaction/masking
5. Request validation schemas

### Phase 3: Long-Term
1. Process-level isolation for code execution
2. WebWorker sandboxing for plugins
3. Hardware security key integration
4. Advanced threat detection
5. Formal security audit

