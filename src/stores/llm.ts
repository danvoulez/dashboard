import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LLMConfig, LLMRequest, LLMResponse, LLMModule, Task } from '@/types'
import { createSpan } from '@/utils/span'

export const useLLMStore = defineStore('llm', () => {
  const config = ref<LLMConfig>({
    provider: 'openai',
    model: 'gpt-4',
    apiKey: ''
  })

  async function callLLM(request: LLMRequest): Promise<LLMResponse> {
    const span = createSpan({
      name: 'llm.call',
      kind: 'client',
      attributes: {
        module: request.module,
        provider: config.value.provider,
        model: config.value.model
      }
    })

    try {
      span.addEvent('llm_request', {
        module: request.module,
        promptLength: request.prompt.length
      })

      // In a real implementation, this would call the actual LLM API
      // For now, we'll simulate the response based on the module
      const result = await simulateLLMCall(request, span)

      const response: LLMResponse = {
        result,
        spanId: span.getSpan().id,
        hash: await hashRequest(request),
        timestamp: new Date().toISOString()
      }

      span.addEvent('llm_response', {
        resultType: typeof result
      })

      await span.end('ok')
      return response
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function classifyTasks(tasks: Task[]): Promise<Task[]> {
    const request: LLMRequest = {
      module: 'classify_tasks',
      prompt: 'Classify and prioritize the following tasks based on urgency, importance, and context.',
      input: tasks,
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            priority: { type: 'number' },
            tags: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }

    const response = await callLLM(request)
    return response.result
  }

  async function summarizeState(state: any): Promise<string> {
    const request: LLMRequest = {
      module: 'summarize_state',
      prompt: 'Summarize the current operational state in natural language.',
      input: state,
      schema: { type: 'string' }
    }

    const response = await callLLM(request)
    return response.result
  }

  async function generateTaskFromInput(input: any): Promise<Partial<Task>> {
    const request: LLMRequest = {
      module: 'generate_task_from_input',
      prompt: 'Generate a task from the following input (span, text, or event).',
      input,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          deadline: { type: 'string' }
        }
      }
    }

    const response = await callLLM(request)
    return response.result
  }

  async function planNextSteps(pluginId: string, context: any): Promise<string[]> {
    const request: LLMRequest = {
      module: 'plan_next_steps',
      prompt: `Given the plugin "${pluginId}" and current context, generate a plan of action.`,
      input: context,
      schema: {
        type: 'array',
        items: { type: 'string' }
      }
    }

    const response = await callLLM(request)
    return response.result
  }

  async function explainSpan(spanId: string, spanData: any): Promise<string> {
    const request: LLMRequest = {
      module: 'explain_span',
      prompt: 'Transform this technical span into a human-readable explanation.',
      input: spanData,
      schema: { type: 'string' }
    }

    const response = await callLLM(request)
    return response.result
  }

  async function generatePolicy(naturalLanguageInput: string): Promise<any> {
    const request: LLMRequest = {
      module: 'generate_policy',
      prompt: 'Transform this natural language command into a computable automation policy.',
      input: { text: naturalLanguageInput },
      schema: {
        type: 'object',
        properties: {
          trigger: { type: 'string' },
          condition: { type: 'string' },
          action: { type: 'string' }
        }
      }
    }

    const response = await callLLM(request)
    return response.result
  }

  function updateConfig(newConfig: Partial<LLMConfig>) {
    config.value = { ...config.value, ...newConfig }
  }

  return {
    config,
    callLLM,
    classifyTasks,
    summarizeState,
    generateTaskFromInput,
    planNextSteps,
    explainSpan,
    generatePolicy,
    updateConfig
  }
}, {
  persist: {
    storage: localStorage,
    paths: ['config']
  }
})

// Simulate LLM calls for demonstration
async function simulateLLMCall(request: LLMRequest, span: any): Promise<any> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500))

  switch (request.module) {
    case 'classify_tasks':
      return request.input.map((task: Task) => ({
        id: task.id,
        priority: Math.floor(Math.random() * 100),
        tags: [...task.tags, 'ai-classified']
      }))

    case 'summarize_state':
      return 'Sistema operacional normal. 5 tarefas pendentes, 2 urgentes. Última sincronização: 5 minutos atrás.'

    case 'generate_task_from_input':
      return {
        title: 'Generated Task',
        description: 'Task generated from input',
        tags: ['ai-generated'],
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }

    case 'plan_next_steps':
      return [
        'Review current plugin configuration',
        'Execute pending validations',
        'Sync with remote services',
        'Generate status report'
      ]

    case 'explain_span':
      return 'A operação foi executada com sucesso em 250ms, processando 15 items sem erros.'

    case 'generate_policy':
      return {
        trigger: 'file.uploaded',
        condition: 'file.type === "pdf"',
        action: 'createTask({ title: "Review " + file.name, origin: "upload" })'
      }

    default:
      throw new Error(`Unknown LLM module: ${request.module}`)
  }
}

async function hashRequest(request: LLMRequest): Promise<string> {
  const str = JSON.stringify(request)
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
