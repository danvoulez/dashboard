import type { Policy } from '@/types'
import { createSpan } from '@/utils/span'
import { getPolicies, savePolicies } from '@/utils/db'
import { useTaskStore } from '@/stores/tasks'
import { v4 as uuidv4 } from 'uuid'
import { getPolicySandbox } from '@/security/policy_sandbox'

export interface PolicyContext {
  event: any
  trigger: string
  timestamp: string
  metadata?: Record<string, any>
}

/**
 * Policy Agent - Executes automation policies with secure sandbox
 */
export class PolicyAgent {
  private policies: Policy[] = []
  private sandbox = getPolicySandbox()

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
   * Execute single policy with deduplication and rate limiting
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
      // Compute event hash for deduplication
      const eventHash = await this.sandbox.computeEventHash(context.event)
      policySpan.setAttribute('eventHash', eventHash.substring(0, 16))

      // Evaluate condition
      const conditionMet = await this.evaluateCondition(policy.condition, context)

      policySpan.setAttribute('conditionMet', conditionMet)

      if (!conditionMet) {
        await policySpan.end('ok')
        return false
      }

      // Execute action with sandbox
      const executionResult = await this.executeAction(
        policy.action,
        context,
        policySpan,
        policy.id,
        eventHash
      )

      if (!executionResult.success) {
        throw new Error(executionResult.error || 'Action execution failed')
      }

      policySpan.setAttribute('executionTime', executionResult.executionTime)

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
   * Evaluate policy condition using secure sandbox (NO 'with' statement)
   */
  private async evaluateCondition(condition: string, context: PolicyContext): Promise<boolean> {
    try {
      const result = await this.sandbox.evaluateCondition(condition, context, {
        timeout: 3000 // 3 second timeout for conditions
      })

      if (!result.success) {
        console.error('Condition evaluation failed:', result.error)
        return false
      }

      return result.result || false
    } catch (error) {
      console.error('Condition evaluation error:', error)
      return false
    }
  }

  /**
   * Execute policy action using secure sandbox (NO 'with' statement)
   */
  private async executeAction(
    action: string,
    context: PolicyContext,
    span: any,
    policyId: string,
    eventHash: string
  ): Promise<{ success: boolean; error?: string; executionTime: number }> {
    // Create execution context with available functions
    const taskStore = useTaskStore()

    const allowedFunctions = {
      createTask: async (opts: any) => {
        span.addEvent('action.createTask', { title: opts.title })
        return await taskStore.createTask(opts.title, {
          description: opts.description,
          tags: opts.tags || [],
          origin: 'policy',
          deadline: opts.deadline,
          spanId: span.getSpan().id,
          metadata: {
            policyId,
            eventHash: eventHash.substring(0, 16)
          }
        })
      },
      updateTask: async (id: string, updates: any) => {
        span.addEvent('action.updateTask', { taskId: id })
        return await taskStore.updateTask(id, updates)
      },
      log: (message: string) => {
        span.addEvent('action_log', { message })
      }
    }

    try {
      const result = await this.sandbox.executeAction(
        action,
        context,
        allowedFunctions,
        {
          timeout: 5000, // 5 second timeout
          policyId,
          eventHash
        }
      )

      if (result.success) {
        span.addEvent('action_executed', {
          executionTime: result.executionTime
        })
      } else {
        span.addEvent('action_failed', {
          error: result.error,
          executionTime: result.executionTime
        })
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      span.addEvent('action_error', { error: errorMsg })
      return {
        success: false,
        error: errorMsg,
        executionTime: 0
      }
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
   * Test policy against sample event (dry-run mode)
   */
  async testPolicy(
    policy: Policy,
    sampleEvent: any,
    options: { dryRun?: boolean } = {}
  ): Promise<{
    conditionMet: boolean
    error?: string
    executionTime?: number
    actionResult?: any
  }> {
    const context: PolicyContext = {
      event: sampleEvent,
      trigger: policy.trigger,
      timestamp: new Date().toISOString()
    }

    try {
      // Test condition
      const conditionResult = await this.sandbox.evaluateCondition(
        policy.condition,
        context,
        { dryRun: options.dryRun }
      )

      if (!conditionResult.success) {
        return {
          conditionMet: false,
          error: conditionResult.error,
          executionTime: conditionResult.executionTime
        }
      }

      const result: any = {
        conditionMet: conditionResult.result || false,
        executionTime: conditionResult.executionTime
      }

      // If condition met and dry-run, test action too
      if (conditionResult.result && options.dryRun) {
        const actionResult = await this.sandbox.executeAction(
          policy.action,
          context,
          {
            createTask: async () => ({ id: 'dry-run-task' }),
            updateTask: async () => ({}),
            log: () => {}
          },
          { dryRun: true }
        )

        result.actionResult = {
          success: actionResult.success,
          error: actionResult.error,
          executionTime: actionResult.executionTime
        }
      }

      return result
    } catch (error) {
      return {
        conditionMet: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Get policy execution statistics
   */
  getPolicyStats(policyId?: string) {
    return this.sandbox.getStats(policyId)
  }

  /**
   * Reset rate limits for a policy (admin function)
   */
  resetPolicyRateLimits() {
    this.sandbox.resetRateLimits()
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
