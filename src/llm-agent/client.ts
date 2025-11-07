import axios, { AxiosInstance } from 'axios'
import type { LLMConfig } from '@/types'
import { createSpan } from '@/utils/span'

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMCallOptions {
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json' | 'text'
  schema?: any
}

export interface LLMCallResult {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  model: string
}

/**
 * Abstract LLM Client
 */
abstract class BaseLLMClient {
  protected config: LLMConfig
  protected client: AxiosInstance

  constructor(config: LLMConfig) {
    this.config = config
    this.client = axios.create({
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  abstract call(options: LLMCallOptions): Promise<LLMCallResult>
}

/**
 * OpenAI Client
 */
class OpenAIClient extends BaseLLMClient {
  constructor(config: LLMConfig) {
    super(config)
    if (config.apiKey) {
      this.client.defaults.headers['Authorization'] = `Bearer ${config.apiKey}`
    }
  }

  async call(options: LLMCallOptions): Promise<LLMCallResult> {
    const endpoint = this.config.endpoint || 'https://api.openai.com/v1/chat/completions'

    const payload: any = {
      model: this.config.model || 'gpt-4-turbo-preview',
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000
    }

    // Add JSON mode if requested
    if (options.responseFormat === 'json') {
      payload.response_format = { type: 'json_object' }
    }

    const response = await this.client.post(endpoint, payload)

    const choice = response.data.choices[0]
    return {
      content: choice.message.content,
      usage: {
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens
      },
      model: response.data.model
    }
  }
}

/**
 * Ollama Client (local models)
 */
class OllamaClient extends BaseLLMClient {
  async call(options: LLMCallOptions): Promise<LLMCallResult> {
    const endpoint = this.config.endpoint || 'http://localhost:11434/api/chat'

    // Combine system and user messages for Ollama
    const prompt = options.messages
      .map(m => {
        if (m.role === 'system') return `System: ${m.content}`
        if (m.role === 'user') return `User: ${m.content}`
        return `Assistant: ${m.content}`
      })
      .join('\n\n')

    const payload = {
      model: this.config.model || 'llama2',
      messages: options.messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7
      }
    }

    // Add format hint for JSON
    if (options.responseFormat === 'json') {
      payload.options = {
        ...payload.options,
        // @ts-ignore
        format: 'json'
      }
    }

    const response = await this.client.post(endpoint, payload)

    return {
      content: response.data.message.content,
      model: this.config.model || 'llama2'
    }
  }
}

/**
 * MacMind Client (custom endpoint)
 */
class MacMindClient extends BaseLLMClient {
  async call(options: LLMCallOptions): Promise<LLMCallResult> {
    const endpoint = this.config.endpoint || 'http://localhost:8000/v1/chat/completions'

    const payload = {
      model: this.config.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000
    }

    const response = await this.client.post(endpoint, payload)

    return {
      content: response.data.choices[0].message.content,
      model: this.config.model
    }
  }
}

/**
 * Factory to create LLM client based on provider
 */
export function createLLMClient(config: LLMConfig): BaseLLMClient {
  switch (config.provider) {
    case 'openai':
      return new OpenAIClient(config)
    case 'ollama':
      return new OllamaClient(config)
    case 'macmind':
      return new MacMindClient(config)
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`)
  }
}

/**
 * High-level LLM call with tracing and error handling
 */
export async function callLLM(
  config: LLMConfig,
  options: LLMCallOptions
): Promise<LLMCallResult> {
  const span = createSpan({
    name: 'llm.call',
    kind: 'client',
    attributes: {
      provider: config.provider,
      model: config.model,
      messageCount: options.messages.length,
      responseFormat: options.responseFormat
    }
  })

  try {
    const client = createLLMClient(config)

    span.addEvent('llm_request_start', {
      temperature: options.temperature,
      maxTokens: options.maxTokens
    })

    const result = await client.call(options)

    span.addEvent('llm_request_complete', {
      contentLength: result.content.length,
      totalTokens: result.usage?.totalTokens
    })

    if (result.usage) {
      span.setAttribute('usage.promptTokens', result.usage.promptTokens)
      span.setAttribute('usage.completionTokens', result.usage.completionTokens)
      span.setAttribute('usage.totalTokens', result.usage.totalTokens)
    }

    await span.end('ok')
    return result
  } catch (error) {
    span.addEvent('llm_error', {
      error: error instanceof Error ? error.message : String(error)
    })
    await span.end('error', error instanceof Error ? error.message : String(error))
    throw error
  }
}

/**
 * Call LLM with JSON schema validation
 */
export async function callLLMWithSchema<T = any>(
  config: LLMConfig,
  options: LLMCallOptions
): Promise<T> {
  const result = await callLLM(config, {
    ...options,
    responseFormat: 'json'
  })

  try {
    return JSON.parse(result.content)
  } catch (error) {
    throw new Error(`Failed to parse LLM JSON response: ${error}`)
  }
}

/**
 * Stream LLM response (for future implementation)
 */
export async function* streamLLM(
  config: LLMConfig,
  options: LLMCallOptions
): AsyncGenerator<string> {
  // TODO: Implement streaming for real-time responses
  const result = await callLLM(config, options)
  yield result.content
}
