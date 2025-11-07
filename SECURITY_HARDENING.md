# Security Hardening - Radar Dashboard PWA

> **Status**: Production-Ready
> **Last Updated**: 2025-11-07
> **Version**: 1.0.0

## Overview

This document describes the comprehensive security hardening implemented for the Radar Dashboard PWA to ensure safe operation in production environments.

---

## 🔒 Security Layers Implemented

### 1. **Webhook Security** (`src/sensors/webhook_receiver.ts`)

#### Features
- ✅ **HMAC-SHA256 Signature Verification** (Web Crypto API)
- ✅ **Rate Limiting**: 100 requests/minute per webhook+IP
- ✅ **Circuit Breaker**: Blocks after 10 violations
- ✅ **Payload Hash Deduplication**: Rejects duplicates within 60s
- ✅ **Payload Structure Validation**: GitHub, Telegram, generic
- ✅ **Payload Sanitization**: XSS prevention
- ✅ **Timestamp Validation**: 5-minute skew tolerance (replay attack prevention)
- ✅ **TTL Enforcement**: 30-day event retention with auto-cleanup

#### Usage
```typescript
import { getWebhookReceiver } from '@/sensors/webhook_receiver'

const receiver = getWebhookReceiver()

// Configure webhook with signature requirement
receiver.registerWebhook({
  id: 'github-webhook',
  name: 'GitHub Events',
  secret: 'your-secret-key',
  provider: 'github',
  requireSignature: true,
  enabled: true
})

// Receive webhook
const event = await receiver.receiveWebhook(
  'github-webhook',
  payload,
  {
    'x-hub-signature-256': 'sha256=...',
    'x-webhook-timestamp': '1699380000',
    'x-forwarded-for': '192.168.1.1'
  }
)
```

#### Security Checks
1. **Webhook exists and enabled**
2. **Rate limit** (per webhook+IP)
3. **Payload structure validation**
4. **Duplicate detection** (via SHA-256 hash)
5. **HMAC signature verification**
6. **Timestamp validation**
7. **Payload sanitization**
8. **Header sanitization**

#### Blocked Attack Vectors
- ❌ Webhook forgery (HMAC verification)
- ❌ Replay attacks (timestamp + deduplication)
- ❌ Rate limit bypass (combined webhook+IP key)
- ❌ XSS injection (payload sanitization)
- ❌ Information leakage (header whitelist)

---

### 2. **Policy Agent Security** (`src/execution/policy_agent.ts`)

#### Features
- ✅ **NO `with` statement** - Removed dangerous code execution
- ✅ **Proxy-based Context Isolation**
- ✅ **Token-based Validation** (not just regex)
- ✅ **Dry-run Mode**: Test without execution
- ✅ **Rollback Support**: Structured error handling
- ✅ **Deduplication**: Hash-based (60s window)
- ✅ **Rate Limiting**: 100 executions/minute per policy
- ✅ **Timeout Enforcement**: 3s (conditions), 5s (actions)

#### Usage
```typescript
import { getPolicyAgent } from '@/execution/policy_agent'

const agent = getPolicyAgent()

// Create policy
const policy = await agent.createPolicy({
  name: 'Auto-tag urgent tasks',
  trigger: 'task.created',
  condition: 'event.title.includes("urgent")',
  action: 'await createTask({ title: "Review: " + event.title, tags: ["urgent"] })',
  enabled: true
})

// Test policy (dry-run)
const result = await agent.testPolicy(policy, sampleEvent, { dryRun: true })
console.log(result.conditionMet) // true/false
console.log(result.actionResult)  // { success, error, executionTime }
```

#### Security Checks
1. **Code validation** (blocked patterns)
2. **Event hash computation** (deduplication)
3. **Condition evaluation** (secure sandbox)
4. **Rate limit check**
5. **Action execution** (isolated context)
6. **Result recording**

#### Blocked Attack Vectors
- ❌ Code injection (sandbox + Proxy)
- ❌ Prototype pollution (`__proto__`, `constructor`)
- ❌ Resource exhaustion (rate limiting + timeout)
- ❌ Context manipulation (Proxy isolation)

---

### 3. **Code Execution Security** (`src/execution/run_code.ts`)

#### Features
- ✅ **Token-based Validation** (AST-like analysis)
- ✅ **Proxy-based Secure Context**
- ✅ **Circuit Breaker**: Blocks after 5 consecutive failures
- ✅ **Quota Enforcement**: 60 executions/min, 500/hour
- ✅ **Bracket Balance Check** (injection detection)
- ✅ **Obfuscation Detection** (hex, unicode, encoding)
- ✅ **Prototype Pollution Protection**
- ✅ **Import/Require Blocking**
- ✅ **30-second Timeout** (configurable)

#### Usage
```typescript
import { runCode } from '@/execution/run_code'

const result = await runCode(
  `
  const tasks = getTasks()
  log('Found ' + tasks.length + ' tasks')
  return tasks.filter(t => t.status === 'pending')
  `,
  {
    input: { filter: 'pending' },
    timeout: 10000,
    tenantId: 'user-123'
  }
)

console.log(result.success) // true
console.log(result.result)  // filtered tasks
console.log(result.duration) // ms
```

#### Security Checks
1. **Enhanced validation** (token analysis + regex)
2. **Code size limit** (50KB)
3. **Blocked globals** (window, eval, process, etc.)
4. **Quota check** (per tenant)
5. **Circuit breaker** (per tenant)
6. **Safe context creation** (Proxy isolation)
7. **Timeout enforcement**
8. **Result recording** (for circuit breaker)

#### Blocked Patterns
```javascript
// ❌ BLOCKED
eval('code')
new Function('code')
__proto__
constructor['constructor']
setTimeout(...)
import('module')
require('module')
process.exit()
window.location = '...'
```

---

### 4. **LLM Security** (`src/llm-agent/safe_llm.ts`)

#### Features
- ✅ **Prompt Splitting**: Separate system/user components
- ✅ **Prompt Hash**: SHA-256 for caching/deduplication
- ✅ **Prompt Injection Detection**: 8 patterns
- ✅ **Response Validation**: Format, schema, leakage
- ✅ **Token Quota**: 4K/request, 20K/min, 100K/hour
- ✅ **Response Caching**: 1-hour TTL
- ✅ **Automatic Fallback**: Provider chain
- ✅ **Retry with Backoff**: 2 retries, exponential delay

#### Usage
```typescript
import { callSafeLLM } from '@/llm-agent/safe_llm'

const result = await callSafeLLM(
  {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: process.env.OPENAI_API_KEY
  },
  {
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Summarize this task data: ...' }
    ],
    responseFormat: 'json',
    schema: { type: 'object', required: ['title', 'description'] },
    enableCache: true,
    enableFallback: true,
    tenantId: 'user-123'
  }
)

console.log(result.content)           // LLM response
console.log(result.cached)            // true if from cache
console.log(result.promptHash)        // for tracking
console.log(result.injectionDetected) // security warning
console.log(result.fallbackUsed)      // true if primary failed
```

#### Injection Patterns Detected
- `ignore previous instructions`
- `forget everything`
- `you are now a...`
- `system: you...`
- `<system>` tags
- `repeat the password`
- `show me the prompt`

#### Fallback Chain
1. **OpenAI** → MacMind → Ollama
2. **MacMind** → Ollama
3. **Ollama** → MacMind

---

### 5. **Observer Bot Security** (`src/execution/observer_bot.ts`)

#### Features
- ✅ **Rate Limiting**: 10 actions/minute per rule
- ✅ **Deduplication**: Span+rule tracking (5-minute window)
- ✅ **Throttling**: 100ms minimum between actions
- ✅ **Safe LLM Integration**: With cache and fallback
- ✅ **Error Handling**: Graceful degradation

#### Usage
```typescript
import { getObserverBot } from '@/execution/observer_bot'

const bot = getObserverBot()

// Add custom rule
bot.addRule({
  id: 'critical-errors',
  name: 'Alert on Critical Errors',
  description: 'Create tasks for critical errors',
  spanPattern: /payment|auth|database/,
  condition: (span) => span.status === 'error' && span.attributes?.severity === 'critical',
  action: 'create_task',
  actionConfig: {},
  enabled: true
})

// Start monitoring
bot.start(5000) // Check every 5s

// Get stats
const stats = bot.getStats()
console.log(stats.actionsPerRule) // Rate limit status
console.log(stats.processedSpans) // Deduplication count
```

---

## 🛡️ System-Wide Protections

### Rate Limiting Matrix

| Component | Per Request | Per Minute | Per Hour |
|-----------|-------------|------------|----------|
| Webhooks | N/A | 100 | N/A |
| Policies | N/A | 100 | N/A |
| Code Execution | 50KB code | 60 | 500 |
| LLM Tokens | 4K tokens | 20K | 100K |
| Observer Actions | N/A | 10 per rule | N/A |

### Circuit Breaker Configuration

| Component | Threshold | Timeout |
|-----------|-----------|---------|
| Webhooks | 10 violations | N/A |
| Code Execution | 5 failures | 60s |
| LLM | N/A | N/A |

### Deduplication Windows

| Component | Window |
|-----------|--------|
| Webhooks | 60s (payload hash) |
| Policies | 60s (event hash) |
| Observer Bot | 5min (span+rule) |
| LLM Cache | 1h (prompt hash) |

---

## 📊 Monitoring & Observability

### Span Attributes

All security operations emit spans with:
- `traceId`: Full request trace
- `eventType`: Security event type
- `caller`: Component that initiated
- `source`: Origin of request
- `tenant_id`: Tenant isolation
- `timestamp`: ISO 8601
- Security-specific attributes (rate limits, quota, etc.)

### NDJSON Export

```javascript
{
  "id": "span-123",
  "traceId": "trace-456",
  "eventType": "webhook.received",
  "caller": "webhook_receiver",
  "source": "github",
  "tenant_id": "default",
  "timestamp": "2025-11-07T12:00:00Z",
  "payload": { /* sanitized */ },
  "status": "ok",
  "attributes": {
    "rate_limit_remaining": 95,
    "signature_verified": true,
    "duplicate_check": "passed"
  }
}
```

---

## 🚀 Production Deployment Checklist

### Before Deployment

- [ ] Set secure webhook secrets (min 32 characters)
- [ ] Configure rate limits for your scale
- [ ] Enable circuit breakers
- [ ] Set up monitoring/alerting for:
  - Rate limit violations
  - Circuit breaker trips
  - Injection detection
  - Quota exhaustion
- [ ] Test fallback chains
- [ ] Review and prune default policies
- [ ] Configure TTL for events/cache
- [ ] Set up log aggregation

### Environment Variables

```bash
# LLM Configuration
OPENAI_API_KEY=sk-...
OLLAMA_ENDPOINT=http://localhost:11434
MACMIND_ENDPOINT=http://localhost:8000

# Security
WEBHOOK_SECRET_ROTATION_DAYS=90
MAX_PAYLOAD_SIZE=1048576  # 1MB
ENABLE_CIRCUIT_BREAKER=true

# Rate Limits
WEBHOOK_RATE_LIMIT=100
CODE_EXECUTION_RATE_LIMIT=60
LLM_TOKEN_LIMIT_PER_HOUR=100000
```

---

## 🔍 Security Audit Summary

### Critical Vulnerabilities Fixed

| ID | Component | Issue | Status |
|----|-----------|-------|--------|
| CRIT-001 | webhook_receiver.ts | Stubbed HMAC verification | ✅ **FIXED** |
| CRIT-002 | policy_agent.ts | `with` statement injection | ✅ **FIXED** |
| CRIT-003 | run_code.ts | Regex-only validation | ✅ **FIXED** |
| CRIT-004 | llm-agent/client.ts | API keys in browser memory | ⚠️ **MITIGATED** |

### High-Risk Issues Fixed

| ID | Component | Issue | Status |
|----|-----------|-------|--------|
| HIGH-001 | observer_bot.ts | Unbounded LLM calls | ✅ **FIXED** |
| HIGH-002 | policy_agent.ts | No rate limiting | ✅ **FIXED** |
| HIGH-003 | webhook_receiver.ts | No deduplication | ✅ **FIXED** |
| HIGH-004 | run_code.ts | No circuit breaker | ✅ **FIXED** |
| HIGH-005 | llm-agent | No prompt injection detection | ✅ **FIXED** |

---

## 📚 Additional Resources

- [Web Crypto API Spec](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Prompt Injection Guide](https://simonwillison.net/2023/Apr/14/worst-that-can-happen/)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)

---

## 🤝 Contributing

Found a security issue? Please report to: [security@example.com]

**Do NOT open public GitHub issues for security vulnerabilities.**

---

## ⚖️ License

MIT License - See LICENSE file for details

---

**Built with security in mind for production-grade PWA deployment** 🚀
