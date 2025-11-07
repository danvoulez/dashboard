import type { Span } from '@/types'
import { createSpan, SpanBuilder } from '@/utils/span'
import { getSpans } from '@/utils/db'
import { createLLMAgent } from '@/llm-agent'
import { useTaskStore } from '@/stores/tasks'
import { useLLMStore } from '@/stores/llm'
import { callSafeLLM } from '@/llm-agent/safe_llm'

export interface ObserverRule {
  id: string
  name: string
  description: string
  spanPattern: RegExp | string
  condition?: (span: Span) => boolean
  action: 'create_task' | 'trigger_policy' | 'notify' | 'custom'
  actionConfig: Record<string, any>
  enabled: boolean
}

interface ActionRateLimit {
  count: number
  windowStart: number
  lastAction: number
}

/**
 * Observer Bot - Monitors spans and triggers actions with rate limiting
 */
export class ObserverBot {
  private rules: ObserverRule[] = []
  private isRunning = false
  private checkInterval: NodeJS.Timeout | null = null
  private actionRateLimits = new Map<string, ActionRateLimit>()
  private processedSpans = new Set<string>() // Deduplication

  // Rate limit configuration
  private readonly MAX_ACTIONS_PER_MINUTE = 10
  private readonly MAX_ACTIONS_PER_HOUR = 100
  private readonly RATE_LIMIT_WINDOW = 60000 // 1 minute
  private readonly DEDUP_WINDOW = 300000 // 5 minutes

  constructor(rules: ObserverRule[] = []) {
    this.rules = rules

    // Cleanup processed spans every 5 minutes
    setInterval(() => this.cleanupProcessedSpans(), 5 * 60 * 1000)
  }

  /**
   * Start observing spans
   */
  start(intervalMs: number = 5000) {
    if (this.isRunning) {
      console.warn('Observer bot already running')
      return
    }

    this.isRunning = true
    console.log('Observer bot started')

    this.checkInterval = setInterval(async () => {
      await this.checkSpans()
    }, intervalMs)
  }

  /**
   * Stop observing
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    this.isRunning = false
    console.log('Observer bot stopped')
  }

  /**
   * Add observation rule
   */
  addRule(rule: ObserverRule) {
    this.rules.push(rule)
  }

  /**
   * Remove rule by ID
   */
  removeRule(id: string) {
    this.rules = this.rules.filter(r => r.id !== id)
  }

  /**
   * Check recent spans against rules
   */
  private async checkSpans() {
    const span = createSpan({ name: 'observer_bot.check' })

    try {
      const spans = await getSpans()
      // Only check recent spans (last 10 minutes)
      const recentSpans = spans.filter(s => {
        const age = Date.now() - new Date(s.startTime).getTime()
        return age < 10 * 60 * 1000
      })

      span.setAttribute('spanCount', recentSpans.length)
      span.setAttribute('ruleCount', this.rules.length)

      let triggeredCount = 0

      for (const observedSpan of recentSpans) {
        for (const rule of this.rules) {
          if (!rule.enabled) continue

          if (await this.matchesRule(observedSpan, rule)) {
            await this.executeAction(observedSpan, rule, span)
            triggeredCount++
          }
        }
      }

      span.setAttribute('triggeredCount', triggeredCount)
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Check if span matches rule
   */
  private async matchesRule(span: Span, rule: ObserverRule): Promise<boolean> {
    // Check span name pattern
    let nameMatches = false
    if (typeof rule.spanPattern === 'string') {
      nameMatches = span.name.includes(rule.spanPattern)
    } else {
      nameMatches = rule.spanPattern.test(span.name)
    }

    if (!nameMatches) return false

    // Check custom condition if provided
    if (rule.condition) {
      return rule.condition(span)
    }

    return true
  }

  /**
   * Check rate limit for actions
   */
  private checkActionRateLimit(ruleId: string): { allowed: boolean; reason?: string } {
    const now = Date.now()
    let limit = this.actionRateLimits.get(ruleId)

    if (!limit || now - limit.windowStart > this.RATE_LIMIT_WINDOW) {
      // New window
      limit = {
        count: 0,
        windowStart: now,
        lastAction: 0
      }
      this.actionRateLimits.set(ruleId, limit)
    }

    // Check per-minute limit
    if (limit.count >= this.MAX_ACTIONS_PER_MINUTE) {
      return {
        allowed: false,
        reason: `Rate limit exceeded for rule ${ruleId}: ${limit.count}/${this.MAX_ACTIONS_PER_MINUTE} actions per minute`
      }
    }

    // Throttle: minimum 100ms between actions
    if (now - limit.lastAction < 100) {
      return {
        allowed: false,
        reason: 'Actions too frequent (throttled)'
      }
    }

    return { allowed: true }
  }

  /**
   * Record action execution
   */
  private recordAction(ruleId: string) {
    const limit = this.actionRateLimits.get(ruleId)
    if (limit) {
      limit.count++
      limit.lastAction = Date.now()
    }
  }

  /**
   * Check if span was already processed
   */
  private isSpanProcessed(spanId: string, ruleId: string): boolean {
    const key = `${spanId}:${ruleId}`
    return this.processedSpans.has(key)
  }

  /**
   * Mark span as processed
   */
  private markSpanProcessed(spanId: string, ruleId: string) {
    const key = `${spanId}:${ruleId}`
    this.processedSpans.add(key)
  }

  /**
   * Cleanup old processed spans
   */
  private cleanupProcessedSpans() {
    // For simplicity, clear all after 5 minutes
    // In production, store with timestamps
    this.processedSpans.clear()
  }

  /**
   * Execute rule action with rate limiting and deduplication
   */
  private async executeAction(span: Span, rule: ObserverRule, parentSpan: SpanBuilder) {
    // Check deduplication
    if (this.isSpanProcessed(span.id, rule.id)) {
      parentSpan.addEvent('action_skipped_duplicate', {
        ruleId: rule.id,
        spanId: span.id
      })
      return
    }

    // Check rate limit
    const rateLimitCheck = this.checkActionRateLimit(rule.id)
    if (!rateLimitCheck.allowed) {
      parentSpan.addEvent('action_skipped_rate_limit', {
        ruleId: rule.id,
        reason: rateLimitCheck.reason
      })
      return
    }

    parentSpan.addEvent('executing_action', {
      ruleId: rule.id,
      action: rule.action,
      spanId: span.id
    })

    const taskStore = useTaskStore()
    const llmStore = useLLMStore()

    try {
      switch (rule.action) {
        case 'create_task': {
          // Use SAFE LLM to generate task from span
          const result = await callSafeLLM(llmStore.config, {
            messages: [
              {
                role: 'system',
                content: 'You are an assistant that creates actionable tasks from span data. Generate a concise title and description.'
              },
              {
                role: 'user',
                content: `Create a task for this span:\nName: ${span.name}\nStatus: ${span.status}\nError: ${span.attributes.error || 'none'}\nAttributes: ${JSON.stringify(span.attributes)}`
              }
            ],
            responseFormat: 'json',
            enableCache: true,
            enableFallback: true,
            tenantId: 'observer_bot'
          })

          let taskData: any = {}
          try {
            taskData = JSON.parse(result.content)
          } catch {
            taskData = {
              title: `Review span: ${span.name}`,
              description: `Span ${span.id} requires attention`
            }
          }

          await taskStore.createTask(taskData.title || 'Generated from span', {
            description: taskData.description || `Span: ${span.name}`,
            tags: taskData.tags || ['auto-generated', 'observer'],
            origin: 'span',
            spanId: span.id,
            deadline: taskData.deadline,
            metadata: {
              observerRuleId: rule.id,
              sourceSpanId: span.id,
              llmCached: result.cached
            }
          })

          parentSpan.addEvent('task_created', {
            ruleId: rule.id,
            cached: result.cached
          })

          // Record action and mark as processed
          this.recordAction(rule.id)
          this.markSpanProcessed(span.id, rule.id)

          break
        }

        case 'notify': {
          // Rate-limited notification
          console.log(`[Observer Bot] Notification from rule ${rule.name}:`, span.name)

          this.recordAction(rule.id)
          this.markSpanProcessed(span.id, rule.id)

          break
        }

        case 'custom': {
          // Execute custom action from config
          if (rule.actionConfig.callback) {
            await rule.actionConfig.callback(span, rule)
          }

          this.recordAction(rule.id)
          this.markSpanProcessed(span.id, rule.id)

          break
        }
      }
    } catch (error) {
      parentSpan.addEvent('action_error', {
        ruleId: rule.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Get action statistics
   */
  getStats(): {
    rules: number
    running: boolean
    actionsPerRule: Record<string, { count: number; remaining: number }>
    processedSpans: number
  } {
    const actionsPerRule: Record<string, { count: number; remaining: number }> = {}

    for (const rule of this.rules) {
      const limit = this.actionRateLimits.get(rule.id)
      actionsPerRule[rule.id] = {
        count: limit?.count || 0,
        remaining: this.MAX_ACTIONS_PER_MINUTE - (limit?.count || 0)
      }
    }

    return {
      rules: this.rules.length,
      running: this.isRunning,
      actionsPerRule,
      processedSpans: this.processedSpans.size
    }
  }

  /**
   * Get current rules
   */
  getRules(): ObserverRule[] {
    return [...this.rules]
  }

  /**
   * Is bot running?
   */
  running(): boolean {
    return this.isRunning
  }
}

/**
 * Default observer rules
 */
export const DEFAULT_OBSERVER_RULES: ObserverRule[] = [
  {
    id: 'error-span-to-task',
    name: 'Create task on error',
    description: 'Automatically create task when a span ends with error status',
    spanPattern: /.*/,
    condition: (span) => span.status === 'error',
    action: 'create_task',
    actionConfig: {
      taskTitle: (span: Span) => `Fix error in ${span.name}`,
      tags: ['error', 'auto-generated']
    },
    enabled: true
  },
  {
    id: 'long-running-span',
    name: 'Monitor long operations',
    description: 'Create task for operations taking more than 5 minutes',
    spanPattern: /.*/,
    condition: (span) => {
      if (!span.endTime) return false
      const duration = new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
      return duration > 5 * 60 * 1000
    },
    action: 'create_task',
    actionConfig: {
      taskTitle: (span: Span) => `Review long operation: ${span.name}`,
      tags: ['performance', 'review']
    },
    enabled: false // Disabled by default
  }
]

// Singleton instance
let observerBotInstance: ObserverBot | null = null

/**
 * Get or create observer bot instance
 */
export function getObserverBot(): ObserverBot {
  if (!observerBotInstance) {
    observerBotInstance = new ObserverBot(DEFAULT_OBSERVER_RULES)
  }
  return observerBotInstance
}

/**
 * Initialize and start observer bot
 */
export function startObserverBot(intervalMs?: number) {
  const bot = getObserverBot()
  bot.start(intervalMs)
  return bot
}

/**
 * Stop observer bot
 */
export function stopObserverBot() {
  const bot = getObserverBot()
  bot.stop()
}
