import type { Span } from '@/types'
import { createSpan, SpanBuilder } from '@/utils/span'
import { getSpans } from '@/utils/db'
import { createLLMAgent } from '@/llm-agent'
import { useTaskStore } from '@/stores/tasks'
import { useLLMStore } from '@/stores/llm'

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

/**
 * Observer Bot - Monitors spans and triggers actions
 */
export class ObserverBot {
  private rules: ObserverRule[] = []
  private isRunning = false
  private checkInterval: NodeJS.Timeout | null = null

  constructor(rules: ObserverRule[] = []) {
    this.rules = rules
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
   * Execute rule action
   */
  private async executeAction(span: Span, rule: ObserverRule, parentSpan: SpanBuilder) {
    parentSpan.addEvent('executing_action', {
      ruleId: rule.id,
      action: rule.action,
      spanId: span.id
    })

    const taskStore = useTaskStore()
    const llmStore = useLLMStore()

    switch (rule.action) {
      case 'create_task': {
        // Use LLM to generate task from span
        const llmAgent = createLLMAgent(llmStore.config)
        const taskData = await llmAgent.generateTaskFromSpan(span)

        await taskStore.createTask(taskData.title || 'Generated from span', {
          description: taskData.description,
          tags: taskData.tags || ['auto-generated'],
          origin: 'span',
          spanId: span.id,
          deadline: taskData.deadline,
          metadata: {
            observerRuleId: rule.id,
            sourceSpanId: span.id
          }
        })

        parentSpan.addEvent('task_created', { ruleId: rule.id })
        break
      }

      case 'notify': {
        // TODO: Implement notification system
        console.log(`Notification from rule ${rule.name}:`, span.name)
        break
      }

      case 'custom': {
        // Execute custom action from config
        if (rule.actionConfig.callback) {
          await rule.actionConfig.callback(span, rule)
        }
        break
      }
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
