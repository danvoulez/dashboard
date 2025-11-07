/**
 * LLM Agents for Task Processing
 *
 * Agents:
 * 1. task-summarizer: Generates concise task titles and tags from span data
 * 2. urgency-analyzer: Analyzes task urgency based on content
 * 3. task-editor: Refines task titles and updates urgency
 */

import type { Span, Task } from '@/types'
import { useLLMStore } from '@/stores/llm'

/**
 * Task Summarizer Agent
 *
 * Input: Span
 * Output: { title: string, tags: string[], urgency: number }
 */
export async function taskSummarizerAgent(span: Span): Promise<{
  title: string
  tags: string[]
  suggestedUrgency: number
}> {
  const llmStore = useLLMStore()

  const prompt = `Analyze this span and generate a concise task:

Span Data:
- Name: ${span.name}
- Kind: ${span.kind}
- Status: ${span.status}
- Attributes: ${JSON.stringify(span.attributes, null, 2)}
- Events: ${JSON.stringify(span.events, null, 2)}

Generate:
1. A clear, actionable task title (max 80 chars)
2. Relevant tags (3-5 tags)
3. Suggested urgency score (0-100)

Consider:
- Is this time-sensitive?
- Does it require immediate attention?
- Is it an error or failure?
- Are there deadlines mentioned?

Respond in JSON format:
{
  "title": "...",
  "tags": ["tag1", "tag2", "tag3"],
  "suggestedUrgency": 50
}`

  try {
    const response = await llmStore.callLLM({
      module: 'task_summarizer',
      prompt,
      input: span,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 80 },
          tags: { type: 'array', items: { type: 'string' } },
          suggestedUrgency: { type: 'number', minimum: 0, maximum: 100 }
        },
        required: ['title', 'tags', 'suggestedUrgency']
      }
    })

    return response.result
  } catch (error) {
    console.error('[TaskSummarizer] Error:', error)
    // Fallback
    return {
      title: span.name || 'Untitled Task',
      tags: [span.kind, span.status],
      suggestedUrgency: 50
    }
  }
}

/**
 * Urgency Analyzer Agent
 *
 * Input: Task
 * Output: { urgencyScore: number, reasoning: string, critical: boolean }
 */
export async function urgencyAnalyzerAgent(task: Task): Promise<{
  urgencyScore: number
  reasoning: string
  critical: boolean
}> {
  const llmStore = useLLMStore()

  const prompt = `Analyze this task and determine its urgency level:

Task Data:
- Title: ${task.title}
- Description: ${task.description || 'N/A'}
- Tags: ${task.tags.join(', ')}
- Current Urgency: ${task.urgency}
- Deadline: ${task.deadline || 'None'}
- Created: ${task.createdAt}
- Status: ${task.status}
- Origin: ${task.origin}

Analyze:
1. Time sensitivity (deadlines, overdue)
2. Business impact (critical errors, blockers)
3. Dependencies (blocking other work)
4. Complexity vs. effort

Provide:
1. Urgency score (0-100)
2. Brief reasoning (1-2 sentences)
3. Is this critical? (true/false)

Respond in JSON format:
{
  "urgencyScore": 75,
  "reasoning": "Task has a deadline in 6 hours and is marked as high priority",
  "critical": false
}`

  try {
    const response = await llmStore.callLLM({
      module: 'urgency_analyzer',
      prompt,
      input: task,
      schema: {
        type: 'object',
        properties: {
          urgencyScore: { type: 'number', minimum: 0, maximum: 100 },
          reasoning: { type: 'string' },
          critical: { type: 'boolean' }
        },
        required: ['urgencyScore', 'reasoning', 'critical']
      }
    })

    return response.result
  } catch (error) {
    console.error('[UrgencyAnalyzer] Error:', error)
    // Fallback to current urgency
    return {
      urgencyScore: task.urgency,
      reasoning: 'Using default urgency calculation',
      critical: task.critical
    }
  }
}

/**
 * Task Editor Agent
 *
 * Input: Task + user feedback
 * Output: { title: string, updatedUrgency: number, tags: string[] }
 */
export async function taskEditorAgent(
  task: Task,
  feedback: string
): Promise<{
  title: string
  updatedUrgency: number
  tags: string[]
  description?: string
}> {
  const llmStore = useLLMStore()

  const prompt = `Refine this task based on user feedback:

Current Task:
- Title: ${task.title}
- Description: ${task.description || 'None'}
- Tags: ${task.tags.join(', ')}
- Urgency: ${task.urgency}

User Feedback:
${feedback}

Update the task to:
1. Improve the title (clear, actionable, concise)
2. Adjust urgency if needed
3. Update tags to be more relevant
4. Enhance description if appropriate

Respond in JSON format:
{
  "title": "...",
  "updatedUrgency": 60,
  "tags": ["tag1", "tag2"],
  "description": "..."
}`

  try {
    const response = await llmStore.callLLM({
      module: 'task_editor',
      prompt,
      input: { task, feedback },
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          updatedUrgency: { type: 'number', minimum: 0, maximum: 100 },
          tags: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' }
        },
        required: ['title', 'updatedUrgency', 'tags']
      }
    })

    return response.result
  } catch (error) {
    console.error('[TaskEditor] Error:', error)
    // Fallback
    return {
      title: task.title,
      updatedUrgency: task.urgency,
      tags: task.tags,
      description: task.description
    }
  }
}

/**
 * Batch process tasks with LLM
 */
export async function batchProcessTasks(
  tasks: Task[]
): Promise<Map<string, { urgency: number; reasoning: string }>> {
  const results = new Map<string, { urgency: number; reasoning: string }>()

  for (const task of tasks) {
    try {
      const analysis = await urgencyAnalyzerAgent(task)
      results.set(task.id, {
        urgency: analysis.urgencyScore,
        reasoning: analysis.reasoning
      })
    } catch (error) {
      console.error(`[BatchProcess] Error processing task ${task.id}:`, error)
    }
  }

  return results
}

/**
 * Smart task categorization using LLM
 */
export async function categorizeTasks(
  tasks: Task[]
): Promise<{
  categories: Record<string, Task[]>
  insights: string[]
}> {
  const llmStore = useLLMStore()

  const prompt = `Analyze these tasks and categorize them intelligently:

Tasks (${tasks.length} total):
${tasks.map((t, i) => `${i + 1}. ${t.title} [${t.tags.join(', ')}] - Urgency: ${t.urgency}`).join('\n')}

Provide:
1. Logical categories (e.g., "Urgent & Blocking", "Maintenance", "Future Planning")
2. Task assignments to categories (by task number)
3. Key insights about the overall task load

Respond in JSON format:
{
  "categories": {
    "Category Name": [1, 3, 5],
    "Another Category": [2, 4]
  },
  "insights": [
    "Most tasks are time-sensitive",
    "There's a cluster of error-related tasks"
  ]
}`

  try {
    const response = await llmStore.callLLM({
      module: 'classify_tasks',
      prompt,
      input: tasks,
      schema: {
        type: 'object',
        properties: {
          categories: { type: 'object' },
          insights: { type: 'array', items: { type: 'string' } }
        },
        required: ['categories', 'insights']
      }
    })

    // Map task numbers back to actual tasks
    const categorized: Record<string, Task[]> = {}
    for (const [category, indices] of Object.entries(response.result.categories)) {
      categorized[category] = (indices as number[])
        .map(i => tasks[i - 1])
        .filter(Boolean)
    }

    return {
      categories: categorized,
      insights: response.result.insights
    }
  } catch (error) {
    console.error('[CategorizeTasks] Error:', error)
    // Fallback to simple urgency-based categorization
    return {
      categories: {
        'Critical': tasks.filter(t => t.urgency >= 90),
        'High Priority': tasks.filter(t => t.urgency >= 70 && t.urgency < 90),
        'Medium Priority': tasks.filter(t => t.urgency >= 40 && t.urgency < 70),
        'Low Priority': tasks.filter(t => t.urgency < 40)
      },
      insights: [
        `Total tasks: ${tasks.length}`,
        `Critical tasks: ${tasks.filter(t => t.urgency >= 90).length}`
      ]
    }
  }
}

/**
 * Generate task recommendations
 */
export async function generateTaskRecommendations(
  tasks: Task[],
  userContext: {
    currentFocus?: string
    availableTime?: number // minutes
    skillLevel?: string
  }
): Promise<{
  recommended: Task[]
  reasoning: string[]
}> {
  const llmStore = useLLMStore()

  const prompt = `Given the user's context and these tasks, recommend which tasks to focus on:

User Context:
- Current Focus: ${userContext.currentFocus || 'None'}
- Available Time: ${userContext.availableTime || 'Unknown'} minutes
- Skill Level: ${userContext.skillLevel || 'Not specified'}

Tasks:
${tasks.map((t, i) => `${i + 1}. ${t.title} [Urgency: ${t.urgency}] [Tags: ${t.tags.join(', ')}]`).join('\n')}

Recommend:
1. Top 3-5 tasks to work on next
2. Reasoning for each recommendation

Respond in JSON format:
{
  "recommendedTaskNumbers": [1, 3, 5],
  "reasoning": [
    "Task 1: High urgency and matches current focus",
    "Task 3: Quick win that can be completed in available time"
  ]
}`

  try {
    const response = await llmStore.callLLM({
      module: 'plan_next_steps',
      prompt,
      input: { tasks, userContext },
      schema: {
        type: 'object',
        properties: {
          recommendedTaskNumbers: { type: 'array', items: { type: 'number' } },
          reasoning: { type: 'array', items: { type: 'string' } }
        },
        required: ['recommendedTaskNumbers', 'reasoning']
      }
    })

    const recommended = response.result.recommendedTaskNumbers
      .map((i: number) => tasks[i - 1])
      .filter(Boolean)

    return {
      recommended,
      reasoning: response.result.reasoning
    }
  } catch (error) {
    console.error('[GenerateRecommendations] Error:', error)
    // Fallback: recommend top 5 by urgency
    return {
      recommended: [...tasks].sort((a, b) => b.urgency - a.urgency).slice(0, 5),
      reasoning: ['Recommended based on urgency']
    }
  }
}
