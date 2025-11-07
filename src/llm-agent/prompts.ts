import type { Task, Policy } from '@/types'

export interface PromptTemplate {
  system: string
  user: (input: any) => string
  outputSchema?: any
}

export const PROMPTS: Record<string, PromptTemplate> = {
  classify_tasks: {
    system: `You are a task classification expert. Analyze tasks and assign appropriate priority scores and tags based on:
- Urgency and importance
- Deadlines
- Task origin and context
- Natural language cues in titles and descriptions

Return JSON array with updated task metadata.`,
    user: (tasks: Task[]) => `Classify these tasks:\n\n${JSON.stringify(tasks, null, 2)}`,
    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          priority: { type: 'number', minimum: 0, maximum: 100 },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['id', 'priority', 'tags']
      }
    }
  },

  summarize_state: {
    system: `You are an operations dashboard assistant. Summarize the system state in clear, actionable Portuguese.
Focus on: pending tasks, urgent items, recent activities, and recommended next steps.`,
    user: (state: any) => `Summarize this state:\n\n${JSON.stringify(state, null, 2)}`,
    outputSchema: { type: 'string' }
  },

  generate_task_from_span: {
    system: `You are a task generation expert. Convert execution spans into actionable tasks.
Extract key information: what happened, what needs follow-up, urgency level, suggested deadline.`,
    user: (span: any) => `Generate a task from this execution span:\n\n${JSON.stringify(span, null, 2)}`,
    outputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        deadline: { type: 'string', format: 'date-time' },
        priority: { type: 'number', minimum: 0, maximum: 100 }
      },
      required: ['title', 'description', 'tags']
    }
  },

  generate_policy_from_prompt: {
    system: `You are an automation policy compiler. Transform natural language instructions into executable policies.

Policy format:
{
  "trigger": "event.type (e.g., file.uploaded, task.created, webhook.received)",
  "condition": "JavaScript boolean expression (e.g., file.type === 'pdf' && file.size > 1000000)",
  "action": "JavaScript code to execute (e.g., createTask({ title: 'Review ' + file.name }))"
}

Available functions in action:
- createTask({ title, description, tags, deadline })
- updateTask(taskId, updates)
- uploadFile(file, options)
- sendNotification(message, channel)
- runCode(code, context)`,
    user: (input: string) => `Create a policy from this request:\n\n"${input}"`,
    outputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        trigger: { type: 'string' },
        condition: { type: 'string' },
        action: { type: 'string' }
      },
      required: ['name', 'trigger', 'condition', 'action']
    }
  },

  explain_span: {
    system: `You are a technical documentation expert. Transform execution spans into human-readable explanations in Portuguese.
Focus on: what was executed, duration, success/failure, notable events, and context.`,
    user: (span: any) => `Explain this execution span:\n\n${JSON.stringify(span, null, 2)}`,
    outputSchema: { type: 'string' }
  },

  plan_next_steps: {
    system: `You are a strategic planning assistant. Given a plugin context and current state, suggest concrete next steps.
Be specific, actionable, and prioritized.`,
    user: (context: { pluginId: string; state: any }) =>
      `For plugin "${context.pluginId}", suggest next steps based on this state:\n\n${JSON.stringify(context.state, null, 2)}`,
    outputSchema: {
      type: 'array',
      items: { type: 'string' }
    }
  },

  analyze_upload: {
    system: `You are a file analysis expert. Analyze uploaded files and suggest appropriate tasks and metadata.
Consider file type, content hints from filename, size, and context.`,
    user: (file: { name: string; type: string; size: number }) =>
      `Analyze this file upload:\n\nName: ${file.name}\nType: ${file.type}\nSize: ${file.size} bytes`,
    outputSchema: {
      type: 'object',
      properties: {
        suggestedTask: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            priority: { type: 'number' }
          }
        },
        metadata: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
            suggestedTags: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  },

  prioritize_tasks: {
    system: `You are a task prioritization expert. Re-prioritize tasks based on holistic analysis.
Consider: deadlines, dependencies, user patterns, task age, origin, and business impact.`,
    user: (tasks: Task[]) => `Prioritize these tasks:\n\n${JSON.stringify(tasks, null, 2)}`,
    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          priority: { type: 'number', minimum: 0, maximum: 100 },
          reasoning: { type: 'string' }
        },
        required: ['id', 'priority']
      }
    }
  }
}

/**
 * Get prompt template by name
 */
export function getPrompt(name: string): PromptTemplate {
  const prompt = PROMPTS[name]
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`)
  }
  return prompt
}

/**
 * Build complete prompt with system and user messages
 */
export function buildPrompt(name: string, input: any): { system: string; user: string; schema?: any } {
  const template = getPrompt(name)
  return {
    system: template.system,
    user: template.user(input),
    schema: template.outputSchema
  }
}
