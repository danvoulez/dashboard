import type { LLMConfig, Task, Span, Policy } from '@/types'
import { callLLM, callLLMWithSchema } from './client'
import { buildPrompt } from './prompts'
import type { LLMMessage } from './client'

/**
 * LLM Agent - High-level interface for AI-powered operations
 */
export class LLMAgent {
  private config: LLMConfig

  constructor(config: LLMConfig) {
    this.config = config
  }

  /**
   * Classify and enrich tasks with AI-generated tags and priorities
   */
  async classifyTasks(tasks: Task[]): Promise<Array<{ id: string; priority: number; tags: string[] }>> {
    const prompt = buildPrompt('classify_tasks', tasks)
    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]

    return await callLLMWithSchema(this.config, { messages })
  }

  /**
   * Generate natural language summary of system state
   */
  async summarizeState(state: any): Promise<string> {
    const prompt = buildPrompt('summarize_state', state)
    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]

    const result = await callLLM(this.config, { messages })
    return result.content
  }

  /**
   * Generate task from execution span
   */
  async generateTaskFromSpan(span: Span): Promise<Partial<Task>> {
    const prompt = buildPrompt('generate_task_from_span', span)
    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]

    return await callLLMWithSchema(this.config, { messages })
  }

  /**
   * Transform natural language into executable policy
   */
  async generatePolicyFromPrompt(naturalLanguageInput: string): Promise<Partial<Policy>> {
    const prompt = buildPrompt('generate_policy_from_prompt', naturalLanguageInput)
    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]

    return await callLLMWithSchema(this.config, { messages })
  }

  /**
   * Explain a span in human-readable Portuguese
   */
  async explainSpan(span: Span): Promise<string> {
    const prompt = buildPrompt('explain_span', span)
    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]

    const result = await callLLM(this.config, { messages })
    return result.content
  }

  /**
   * Plan next steps for a plugin
   */
  async planNextSteps(pluginId: string, state: any): Promise<string[]> {
    const prompt = buildPrompt('plan_next_steps', { pluginId, state })
    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]

    return await callLLMWithSchema(this.config, { messages })
  }

  /**
   * Analyze uploaded file and suggest tasks
   */
  async analyzeUpload(file: { name: string; type: string; size: number }): Promise<any> {
    const prompt = buildPrompt('analyze_upload', file)
    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]

    return await callLLMWithSchema(this.config, { messages })
  }

  /**
   * Re-prioritize tasks holistically
   */
  async prioritizeTasks(tasks: Task[]): Promise<Array<{ id: string; priority: number; reasoning?: string }>> {
    const prompt = buildPrompt('prioritize_tasks', tasks)
    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]

    return await callLLMWithSchema(this.config, { messages })
  }

  /**
   * Generic LLM call with custom prompt
   */
  async call(systemPrompt: string, userPrompt: string, expectJSON: boolean = false): Promise<any> {
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    if (expectJSON) {
      return await callLLMWithSchema(this.config, { messages })
    }

    const result = await callLLM(this.config, { messages })
    return result.content
  }

  /**
   * Update LLM configuration
   */
  updateConfig(newConfig: Partial<LLMConfig>) {
    this.config = { ...this.config, ...newConfig }
  }
}

/**
 * Create LLM agent instance
 */
export function createLLMAgent(config: LLMConfig): LLMAgent {
  return new LLMAgent(config)
}

// Re-export types and utilities
export { callLLM, callLLMWithSchema } from './client'
export { getPrompt, buildPrompt } from './prompts'
export type { LLMMessage, LLMCallOptions, LLMCallResult } from './client'
