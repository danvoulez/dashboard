import type { Policy } from '@/types'
import { createSpan } from '@/utils/span'
import { getPolicies, savePolicies } from '@/utils/db'
import { useTaskStore } from '@/stores/tasks'
import { v4 as uuidv4 } from 'uuid'

export interface PolicyContext {
  event: any
  trigger: string
  timestamp: string
  metadata?: Record<string, any>
}

/**
 * Policy Agent - Executes automation policies
 */
export class PolicyAgent {
  private policies: Policy[] = []

  constructor() {
    this.loadPolicies()
  }

  /**
   * Load policies from database
   */
  async loadPolicies() {
    try {
      this.policies = await getPolicies()
    } catch (error) {
      console.error('Failed to load policies:', error)
      this.policies = []
    }
  }

  /**
   * Create new policy
   */
  async createPolicy(policy: Omit<Policy, 'id' | 'createdAt' | 'updatedAt' | 'spanIds'>): Promise<Policy> {
    const span = createSpan({
      name: 'policy_agent.createPolicy',
      attributes: { policyName: policy.name }
    })

    try {
      const now = new Date().toISOString()
      const newPolicy: Policy = {
        ...policy,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
        spanIds: []
      }

      this.policies.push(newPolicy)
      await savePolicies(this.policies)

      span.addEvent('policy_created', { policyId: newPolicy.id })
      await span.end('ok')

      return newPolicy
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Update existing policy
   */
  async updatePolicy(id: string, updates: Partial<Policy>): Promise<Policy> {
    const span = createSpan({
      name: 'policy_agent.updatePolicy',
      attributes: { policyId: id }
    })

    try {
      const index = this.policies.findIndex(p => p.id === id)
      if (index === -1) {
        throw new Error(`Policy not found: ${id}`)
      }

      this.policies[index] = {
        ...this.policies[index],
        ...updates,
        updatedAt: new Date().toISOString()
      }

      await savePolicies(this.policies)

      await span.end('ok')
      return this.policies[index]
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Delete policy
   */
  async deletePolicy(id: string): Promise<void> {
    const span = createSpan({
      name: 'policy_agent.deletePolicy',
      attributes: { policyId: id }
    })

    try {
      this.policies = this.policies.filter(p => p.id !== id)
      await savePolicies(this.policies)
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Execute policies matching a trigger
   */
  async executeTrigger(trigger: string, event: any): Promise<void> {
    const span = createSpan({
      name: 'policy_agent.executeTrigger',
      attributes: { trigger }
    })

    try {
      const matchingPolicies = this.policies.filter(
        p => p.enabled && p.trigger === trigger
      )

      span.setAttribute('matchingPolicies', matchingPolicies.length)

      const context: PolicyContext = {
        event,
        trigger,
        timestamp: new Date().toISOString()
      }

      let executedCount = 0

      for (const policy of matchingPolicies) {
        const executed = await this.executePolicy(policy, context, span)
        if (executed) executedCount++
      }

      span.setAttribute('executedCount', executedCount)
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Execute single policy
   */
  private async executePolicy(
    policy: Policy,
    context: PolicyContext,
    parentSpan: any
  ): Promise<boolean> {
    const policySpan = createSpan({
      name: 'policy_agent.executePolicy',
      parentSpanId: parentSpan.getSpan().id,
      traceId: parentSpan.getSpan().traceId,
      attributes: {
        policyId: policy.id,
        policyName: policy.name
      }
    })

    try {
      // Evaluate condition
      const conditionMet = this.evaluateCondition(policy.condition, context)

      policySpan.setAttribute('conditionMet', conditionMet)

      if (!conditionMet) {
        await policySpan.end('ok')
        return false
      }

      // Execute action
      await this.executeAction(policy.action, context, policySpan)

      // Update policy execution history
      policy.spanIds.push(policySpan.getSpan().id)
      await savePolicies(this.policies)

      policySpan.addEvent('policy_executed')
      await policySpan.end('ok')

      return true
    } catch (error) {
      policySpan.addEvent('policy_error', {
        error: error instanceof Error ? error.message : String(error)
      })
      await policySpan.end('error', error instanceof Error ? error.message : String(error))
      return false
    }
  }

  /**
   * Evaluate policy condition
   */
  private evaluateCondition(condition: string, context: PolicyContext): boolean {
    try {
      // Create safe evaluation context
      const safeContext = {
        event: context.event,
        trigger: context.trigger,
        timestamp: context.timestamp
      }

      // Use Function constructor for safe evaluation
      const evalFunction = new Function('context', `
        with (context) {
          return ${condition}
        }
      `)

      return Boolean(evalFunction(safeContext))
    } catch (error) {
      console.error('Condition evaluation error:', error)
      return false
    }
  }

  /**
   * Execute policy action
   */
  private async executeAction(
    action: string,
    context: PolicyContext,
    span: any
  ): Promise<void> {
    // Create execution context with available functions
    const taskStore = useTaskStore()

    const executionContext = {
      event: context.event,
      context: context,
      createTask: async (opts: any) => {
        return await taskStore.createTask(opts.title, {
          description: opts.description,
          tags: opts.tags,
          origin: 'webhook',
          deadline: opts.deadline,
          spanId: span.getSpan().id
        })
      },
      updateTask: async (id: string, updates: any) => {
        return await taskStore.updateTask(id, updates)
      },
      log: (message: string) => {
        span.addEvent('action_log', { message })
      }
    }

    try {
      // Execute action code
      const actionFunction = new Function('ctx', `
        with (ctx) {
          return (async () => {
            ${action}
          })()
        }
      `)

      await actionFunction(executionContext)
      span.addEvent('action_executed')
    } catch (error) {
      span.addEvent('action_error', {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Get all policies
   */
  getPolicies(): Policy[] {
    return [...this.policies]
  }

  /**
   * Get enabled policies
   */
  getEnabledPolicies(): Policy[] {
    return this.policies.filter(p => p.enabled)
  }

  /**
   * Enable/disable policy
   */
  async togglePolicy(id: string, enabled: boolean): Promise<void> {
    await this.updatePolicy(id, { enabled })
  }

  /**
   * Test policy against sample event
   */
  async testPolicy(policy: Policy, sampleEvent: any): Promise<{ conditionMet: boolean; error?: string }> {
    const context: PolicyContext = {
      event: sampleEvent,
      trigger: policy.trigger,
      timestamp: new Date().toISOString()
    }

    try {
      const conditionMet = this.evaluateCondition(policy.condition, context)
      return { conditionMet }
    } catch (error) {
      return {
        conditionMet: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

// Singleton instance
let policyAgentInstance: PolicyAgent | null = null

/**
 * Get or create policy agent instance
 */
export function getPolicyAgent(): PolicyAgent {
  if (!policyAgentInstance) {
    policyAgentInstance = new PolicyAgent()
  }
  return policyAgentInstance
}

/**
 * Trigger policies for an event
 */
export async function triggerPolicies(trigger: string, event: any): Promise<void> {
  const agent = getPolicyAgent()
  await agent.executeTrigger(trigger, event)
}

/**
 * Common policy triggers
 */
export const POLICY_TRIGGERS = {
  FILE_UPLOADED: 'file.uploaded',
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  WEBHOOK_RECEIVED: 'webhook.received',
  SPAN_ERROR: 'span.error',
  FOCUS_STARTED: 'focus.started',
  FOCUS_ENDED: 'focus.ended',
  DAILY_SUMMARY: 'daily.summary'
} as const
