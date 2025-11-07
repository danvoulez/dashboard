# Radar Dashboard - Comprehensive Architecture Analysis & Safety Guardrails Integration Plan

## Executive Summary

The Radar Dashboard is a Vue 3 + TypeScript PWA (Progressive Web App) that implements a sophisticated task management and workflow automation system with LLM integration, policy-based automation, webhook handling, and code execution capabilities. The architecture emphasizes observability through a Span-based tracing system (similar to OpenTelemetry).

**Current State**: Basic code validation exists but comprehensive safety guardrails are missing across code execution, LLM interactions, policy execution, and webhook processing.

---

## 1. CORE IMPLEMENTATION FILES OVERVIEW

### 1.1 run_code.ts - Code Execution Engine
**Location**: `/home/user/dashboard/src/execution/run_code.ts`
**Purpose**: Execute arbitrary JavaScript code in a sandboxed context

**Key Characteristics**:
- Creates execution context with access to task store, upload store, LLM store
- Uses `Function` constructor with `with` statement for code execution
- Implements 30-second timeout by default
- Basic pattern-matching validation (checks for: eval, Function, import, require, process, global, window.location, document.cookie)

**Current Validation** (Lines 192-217):
```typescript
validateCode() // Checks for dangerous patterns
- /eval\(/
- /Function\(/
- /import\s+/
- /require\(/
- /process\./
- /global\./
- /window\.location/
- /document\.cookie/
```

**Risk Areas**:
- No AST analysis - regex-based validation is easily bypassable
- `Function` constructor + `with` statement is inherently unsafe
- No rate limiting or execution quotas
- Context object provides unchecked access to entire stores
- No execution tracing/monitoring beyond basic spans
- No resource limits (memory, CPU)
- No audit logging of executed code

**Execution Context Available** (Lines 63-91):
```typescript
{
  taskStore, uploadStore, llmStore,
  createTask, updateTask, getTasks, log
}
```

---

### 1.2 observer_bot.ts - Span Observation & Reaction System
**Location**: `/home/user/dashboard/src/execution/observer_bot.ts`
**Purpose**: Monitor spans and trigger automated actions based on rules

**Key Characteristics**:
- Polls spans every 5 seconds (configurable)
- Matches spans against rules using name patterns + optional conditions
- Triggers actions: create_task, trigger_policy, notify, custom
- Default rules: error detection, long-running operation detection

**Current Rules** (Lines 202-233):
1. **error-span-to-task**: Creates task when span ends with error
2. **long-running-span**: Creates task for operations > 5 minutes (disabled by default)

**Risk Areas**:
- Rule evaluation executes user-provided condition functions
- No validation of rule patterns or conditions
- Can create unbounded number of tasks from error spans
- LLM calls are made for task generation without rate limiting
- No audit trail of which spans triggered which actions
- Rule conditions have access to full span object

---

### 1.3 policy_agent.ts - Automation Policy Execution
**Location**: `/home/user/dashboard/src/execution/policy_agent.ts`
**Purpose**: Execute automation policies triggered by events

**Key Characteristics**:
- Evaluates policy conditions using `Function` constructor + `with` statement
- Executes policy actions with similar pattern
- Available functions: createTask, updateTask, log
- Stores execution history in span IDs

**Policy Format** (Lines 125-138):
```typescript
interface Policy {
  id, name, description, enabled
  trigger: string
  condition: string  // JavaScript expression
  action: string     // JavaScript code
  createdAt, updatedAt, createdBy
  spanIds: []       // execution history
}
```

**Risk Areas**:
- Condition evaluation is unsafe (Function constructor)
- Action execution is unsafe (no sandbox, no resource limits)
- No input validation on trigger events
- No rate limiting per trigger
- Infinite loop potential (action can trigger same event)
- No execution timeouts on actions
- No state rollback on failure

**Condition Evaluation** (Lines 207-228):
Uses `Function('context', 'with (context) { return ${condition} }')` - highly unsafe

---

### 1.4 webhook_receiver.ts - External Event Integration
**Location**: `/home/user/dashboard/src/sensors/webhook_receiver.ts`
**Purpose**: Receive and process incoming webhooks

**Key Characteristics**:
- Simple webhook registration with optional secret verification
- Auto-creates tasks from webhook payloads
- Triggers policies based on webhook type
- Stores events in memory

**Current Processing** (Lines 142-178):
1. Verifies signature (minimal implementation - just checks existence)
2. Extracts task title/description from payload
3. Creates task if autoCreateTask enabled
4. Triggers policies

**Risk Areas**:
- Signature verification is stubbed (just checks if signature exists)
- No payload size limits
- No rate limiting per webhook
- Payload data is extracted naively (no sanitization)
- No validation of payload structure
- Potential for unlimited memory growth (events stored in memory)
- No auth mechanism (any webhook ID can be used)
- No HTTPS requirement indication
- No TTL on stored events

**Extraction Logic** (Lines 183-209):
- Simple fallback chain for title extraction
- Full payload stringification for description
- No validation or sanitization

---

### 1.5 llm-agent/client.ts - LLM Integration Layer
**Location**: `/home/user/dashboard/src/llm-agent/client.ts`
**Purpose**: Abstract interface to multiple LLM providers

**Supported Providers**:
- OpenAI (gpt-4-turbo-preview)
- Ollama (local llama2)
- MacMind (custom endpoint)

**Current Features**:
- Basic error handling
- Token usage tracking
- JSON schema validation (client-side only)
- Tracing via spans

**Risk Areas**:
- No input sanitization before sending to LLM
- API key stored in configuration (exposed)
- No prompt injection protection
- No token limit enforcement
- No timeout on LLM calls (60s default)
- Custom endpoint accepts any URL
- No verification of response integrity
- JSON parsing error not well handled

**Key Functions**:
- `createLLMClient()` - Factory based on provider
- `callLLM()` - Basic call with tracing
- `callLLMWithSchema()` - Adds JSON validation
- `streamLLM()` - Generator (not implemented)

---

### 1.6 Span/Tracing System (span.ts & db.ts)
**Location**: `/home/user/dashboard/src/utils/span.ts` and `/home/user/dashboard/src/utils/db.ts`
**Purpose**: Distributed tracing and observability

**Span Structure** (types/index.ts lines 47-67):
```typescript
interface Span {
  id, traceId, parentSpanId
  name, kind ('internal'|'server'|'client'|'producer'|'consumer')
  startTime, endTime, status ('ok'|'error'|'pending')
  attributes, events
  signature?, hash
  userId
}
```

**Database** (IndexedDB via idb):
- Stores: tasks, spans, files, fileMetadata, policies, timeline, focusSessions
- Indexes: by-status, by-traceId, by-userId, by-priority, by-enabled, by-timestamp

**Risk Areas**:
- IndexedDB is not encrypted
- No input validation before storage
- Hash is SHA-256 (not BLAKE3 as mentioned)
- No data sanitization
- Spans can contain sensitive data

---

## 2. TYPE SYSTEM & INTERFACES

### Core Types (types/index.ts)

**Task** (lines 24-38):
- id, title, description, tags, origin (plugin|upload|span|manual|webhook|llm|cron|gdrive)
- status (pending|in_progress|done)
- priority, deadline, spanId, metadata

**Policy** (lines 125-138):
- Stores condition and action as raw strings
- No schema or type hints for conditions/actions

**Span** (lines 47-67):
- Main observability unit
- Events array tracks important moments
- Attributes for contextual data

**LLMConfig** (lines 94-99):
- provider, apiKey, endpoint, model
- No validation on configuration

---

## 3. ERROR HANDLING PATTERNS

### Current Patterns:

**Span-based Error Tracking** (universal pattern):
```typescript
const span = createSpan({ name: 'operation.name' })
try {
  // operation
  await span.end('ok')
} catch (error) {
  await span.end('error', error message)
  throw error
}
```

**Error Attributes**: Stored in span.attributes.error as string

**Error Events**: Added via span.addEvent('operation_error', { error: message })

### Gaps:
- No centralized error logging
- No error deduplication
- No error severity classification
- No automatic remediation
- No alerting mechanism
- No error metrics

---

## 4. DATABASE/STORAGE LAYER

### IndexedDB Schema (db.ts):

**tasks**: { key: id, indexes: by-status, by-assignedTo, by-priority }
**spans**: { key: id, indexes: by-traceId, by-userId }
**fileMetadata**: { key: id, indexes: by-taskId }
**policies**: { key: id, indexes: by-enabled }
**timeline**: { key: id, indexes: by-timestamp, by-userId }
**focusSessions**: { key: id, indexes: by-taskId }

### Operations Provided:
- saveTasks, getTasks, getTasksByStatus
- saveSpan, getSpans, getSpansByTraceId
- savePolicies, getPolicies, getEnabledPolicies
- Timeline and focus session operations

### Limitations:
- No transaction support across multiple stores
- No data migrations
- No encryption
- No backup mechanism
- Limited query capabilities

---

## 5. LLM INTEGRATION PATTERNS

### Available LLM Modules** (llm-agent/index.ts):
1. classify_tasks - Tag and priority enrichment
2. summarize_state - Dashboard state summary
3. generate_task_from_input - Auto-task creation
4. plan_next_steps - Strategic planning
5. explain_span - Human-readable span explanation
6. generate_policy - Convert natural language to policy

### Prompt Templates** (llm-agent/prompts.ts):
- Each module has system and user prompt templates
- JSON schema definitions for structured output
- No input validation before LLM calls

---

## 6. ARCHITECTURAL LAYERS

```
┌─────────────────────────────────────────┐
│         Vue 3 UI Layer (Components)      │
├─────────────────────────────────────────┤
│      Pinia Stores (State Management)     │
│  - tasks, uploads, llm, dashboard, auth  │
├─────────────────────────────────────────┤
│    Execution Layer (Business Logic)      │
│  - run_code.ts (code execution)         │
│  - observer_bot.ts (span observation)   │
│  - policy_agent.ts (automation)         │
│  - webhook_receiver.ts (external events)│
├─────────────────────────────────────────┤
│      Integration Layer                   │
│  - llm-agent/client.ts (LLM calls)     │
│  - llm-agent/index.ts (LLM ops)        │
├─────────────────────────────────────────┤
│      Utilities Layer                     │
│  - span.ts (distributed tracing)        │
│  - task.ts (task utilities)             │
│  - db.ts (IndexedDB access)             │
├─────────────────────────────────────────┤
│      Data Persistence (IndexedDB)        │
└─────────────────────────────────────────┘
```

---

## 7. CURRENT SAFETY FEATURES

### Minimal Safety Measures:
1. **Code validation** (run_code.ts): Regex pattern detection for dangerous keywords
2. **Timeout protection**: 30-second default timeout on code execution
3. **Signature verification** (webhook_receiver.ts): Minimal - just checks existence
4. **Error tracking**: Basic error status on spans
5. **Type safety**: Full TypeScript coverage

### Missing Comprehensive Safety:
- No resource limits (memory, CPU)
- No execution quotas
- No audit logging
- No rate limiting
- No prompt injection protection
- No malicious policy detection
- No webhook payload validation
- No execution sandboxing

---

## 8. INTEGRATION POINTS FOR SAFETY GUARDRAILS

### Critical Integration Points:

#### A. **Code Execution (run_code.ts)**
**Current**: Lines 95-102
```typescript
const codeFunction = new Function('ctx', `
  with (ctx) {
    return (async () => {
      ${code}
    })()
  }
`)
```

**Where to Inject Guardrails**:
1. **Before execution** (line 95): Pre-execution validation
2. **Line 44-51**: Span attributes should capture guardrail checks
3. **Line 96-102**: Code string should be analyzed/sanitized
4. **Line 106**: timeout configuration should respect limits
5. **Line 119**: Span attributes should include execution metrics

#### B. **Policy Execution (policy_agent.ts)**
**Current**: Lines 217-222, 263-269
```typescript
// Condition evaluation (line 217)
const evalFunction = new Function('context', `
  with (context) {
    return ${condition}
  }
`)

// Action execution (line 263)
const actionFunction = new Function('ctx', `
  with (ctx) {
    return (async () => {
      ${action}
    })()
  }
`)
```

**Where to Inject Guardrails**:
1. Lines 128-130: Filter policies before execution
2. Lines 217-222: Validate condition before Function construction
3. Lines 263-269: Validate action before Function construction
4. New span attribute tracking (line 167-170)
5. Add execution history (line 188)

#### C. **Observer Bot Rules (observer_bot.ts)**
**Current**: Lines 126-131 (condition matching)
```typescript
private async matchesRule(span: Span, rule: ObserverRule): Promise<boolean> {
  let nameMatches = false
  if (typeof rule.spanPattern === 'string') {
    nameMatches = span.name.includes(rule.spanPattern)
  } else {
    nameMatches = rule.spanPattern.test(span.name)
  }
  
  if (!nameMatches) return false
  
  if (rule.condition) {
    return rule.condition(span)
  }
  
  return true
}
```

**Where to Inject Guardrails**:
1. Line 98-100: Validate rules before execution
2. Line 127: Rate limit rule triggering
3. Line 148-163: Validate task generation
4. Line 137-141: Track rule execution metadata
5. Add execution quotas per rule

#### D. **Webhook Processing (webhook_receiver.ts)**
**Current**: Lines 81-137
```typescript
async receiveWebhook(webhookId: string, payload: any, headers: Record<string, string>) {
  // ...payload processing...
  await this.processWebhook(event, config, span)
}
```

**Where to Inject Guardrails**:
1. Line 82-91: Validate webhook ID and config
2. Line 105-110: Implement proper signature verification
3. Line 113-121: Validate and sanitize payload
4. Line 150-152: Validate extracted task data
5. Line 170-174: Validate policy trigger data

#### E. **LLM Agent (llm-agent/index.ts & client.ts)**
**Current**: Lines 19-26 (classify tasks)

**Where to Inject Guardrails**:
1. Input sanitization before LLM calls
2. Response validation and sanitization
3. Rate limiting per module
4. Token limit enforcement
5. Prompt injection detection
6. API key security

---

## 9. RECOMMENDED SAFETY GUARDRAILS ARCHITECTURE

### Layers of Protection:

```
Input → Validation → Rate Limiting → Execution → Output → Logging
   ↓         ↓            ↓             ↓         ↓         ↓
- Sanitize - AST check    - Quotas     - Timeout - Parse   - Audit
- Schema   - Pattern      - Per-user   - Mem     - Validate- Metrics
- Bounds   - Signature    - Per-hour   - CPU     - Sanitize- Alert
```

### Core Components Needed:

1. **ExecutionGuardrails**
   - AST-based code analysis
   - Execution quota tracking
   - Resource limits
   - Timeout enforcement

2. **PolicyGuardrails**
   - Policy validation
   - Condition/action analysis
   - Circular dependency detection
   - Execution history limits

3. **WebhookGuardrails**
   - Payload validation (JSON schema)
   - Rate limiting per webhook
   - Signature verification
   - Size limits

4. **LLMGuardrails**
   - Prompt injection detection
   - Token limit enforcement
   - Response validation
   - Cost tracking

5. **AuditLogger**
   - All execution attempts (success/fail)
   - Parameter tracking
   - Audit trail for compliance
   - Error aggregation

6. **RateLimiter**
   - Per-execution-source
   - Per-policy
   - Per-webhook
   - Per-LLM-module
   - Time-window based

---

## 10. RECOMMENDED IMPLEMENTATION SEQUENCE

### Phase 1: Foundation (Execution Guardrails)
1. Create `src/guardrails/` directory
2. Implement `AuditLogger` service
3. Implement `RateLimiter` service
4. Add error classification types
5. Extend Span type for guardrail data

### Phase 2: Code Execution Safety
6. Implement `ExecutionGuardrails` with AST analysis
7. Enhance `run_code.ts` validation
8. Add execution quotas
9. Add resource limits

### Phase 3: Policy & Automation Safety
10. Implement `PolicyGuardrails`
11. Add policy validation to `policy_agent.ts`
12. Add circular dependency detection
13. Integrate with observer bot

### Phase 4: External Integration Safety
14. Implement `WebhookGuardrails`
15. Enhance webhook signature verification
16. Add webhook rate limiting
17. Add payload validation

### Phase 5: LLM Safety
18. Implement `LLMGuardrails`
19. Add prompt injection detection
20. Add token tracking
21. Add response validation

### Phase 6: Monitoring & Compliance
22. Implement centralized error dashboard
23. Add compliance reporting
24. Create guardrails configuration UI
25. Add metrics and alerting

---

## 11. DATA FLOW WITH GUARDRAILS

### Code Execution Flow:
```
User Input Code
    ↓
[ExecutionGuardrails.validate()]
  - AST analysis
  - Pattern detection
  - Signature check
    ↓
[RateLimiter.check()]
  - Per-user quota
  - Per-hour quota
    ↓
[run_code.ts execution]
  - With timeout
  - Span tracking
    ↓
[Output Validation]
[AuditLogger.record()]
```

### Policy Execution Flow:
```
Policy Trigger Event
    ↓
[PolicyGuardrails.validate()]
  - Policy structure
  - Condition syntax
  - Action syntax
  - Dependencies
    ↓
[RateLimiter.check()]
  - Per-trigger quota
  - Per-policy quota
    ↓
[policy_agent.ts execution]
    ↓
[AuditLogger.record()]
```

---

## 12. KEY FILES FOR MODIFICATION

### Existing Files to Enhance:
- `/src/execution/run_code.ts` - Add guardrails integration
- `/src/execution/policy_agent.ts` - Add policy validation
- `/src/execution/observer_bot.ts` - Add rule validation
- `/src/sensors/webhook_receiver.ts` - Add payload validation
- `/src/llm-agent/client.ts` - Add LLM guardrails
- `/src/types/index.ts` - Add guardrail-related types
- `/src/utils/db.ts` - Add error and audit tables

### New Files to Create:
- `/src/guardrails/index.ts` - Main guardrails module
- `/src/guardrails/execution.ts` - Code execution guardrails
- `/src/guardrails/policy.ts` - Policy guardrails
- `/src/guardrails/webhook.ts` - Webhook guardrails
- `/src/guardrails/llm.ts` - LLM guardrails
- `/src/guardrails/audit-logger.ts` - Audit logging
- `/src/guardrails/rate-limiter.ts` - Rate limiting
- `/src/guardrails/error-handler.ts` - Error handling
- `/src/guardrails/validators.ts` - Validation utilities

---

## 13. SUMMARY: CRITICAL AREAS FOR SAFETY GUARDRAILS

| Component | Risk Level | Primary Threats | Priority |
|-----------|-----------|-----------------|----------|
| run_code.ts | **CRITICAL** | Code injection, resource exhaustion, data theft | P0 |
| policy_agent.ts | **CRITICAL** | Infinite loops, resource exhaustion, unauthorized access | P0 |
| webhook_receiver.ts | **HIGH** | Payload injection, unauthorized events, DOS | P1 |
| observer_bot.ts | **HIGH** | Unbounded task creation, infinite loops | P1 |
| llm-agent/client.ts | **HIGH** | Prompt injection, API abuse, response poisoning | P1 |
| IndexedDB storage | **MEDIUM** | Data leakage, unencrypted sensitive data | P2 |

---

## 14. QUICK REFERENCE: INTEGRATION CHECKPOINTS

**run_code.ts**
- Line 44-51: Add guardrail span attributes
- Line 95: Validate code before Function construction
- Line 106: Enforce max timeout
- Line 119: Track execution metrics

**policy_agent.ts**
- Line 128-130: Validate enabled policies
- Line 175: Validate condition evaluation
- Line 185: Validate action execution
- Line 217-222: Add condition validation
- Line 263-269: Add action validation

**observer_bot.ts**
- Line 78: Add guardrail tracking
- Line 94-102: Add rule rate limiting
- Line 148-163: Validate task generation
- Line 137-141: Track action metrics

**webhook_receiver.ts**
- Line 81-102: Validate webhook config
- Line 105-110: Implement real signature verification
- Line 113-121: Validate payload
- Line 150-163: Validate extracted data

**llm-agent/client.ts**
- Line 59-86: Add input sanitization
- Line 74-85: Add response validation
- Line 174-219: Add rate limiting
- Line 189-210: Track guardrail metrics

