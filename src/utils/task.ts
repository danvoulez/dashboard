import { differenceInDays } from 'date-fns'
import type { Task, TaskPriorityFactors } from '@/types'

/**
 * Calculate task priority using the formula:
 * priority = weight + (30 - days_to_deadline) + days_inactive
 */
export function calculateTaskPriority(task: Task, weight: number = 0): number {
  const factors: TaskPriorityFactors = {
    weight,
    daysToDeadline: 0,
    daysInactive: 0
  }

  // Calculate days to deadline
  if (task.deadline) {
    const now = new Date()
    const deadline = new Date(task.deadline)
    factors.daysToDeadline = differenceInDays(deadline, now)
  }

  // Calculate days inactive (since last update)
  const now = new Date()
  const lastUpdate = new Date(task.updatedAt)
  factors.daysInactive = differenceInDays(now, lastUpdate)

  // Apply formula
  const deadlineScore = task.deadline ? (30 - factors.daysToDeadline) : 0
  const priority = factors.weight + deadlineScore + factors.daysInactive

  // Clamp to 0-100
  return Math.max(0, Math.min(100, priority))
}

/**
 * Sort tasks by priority (highest first)
 */
export function sortTasksByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => b.priority - a.priority)
}

/**
 * Filter tasks by status
 */
export function filterTasksByStatus(tasks: Task[], status: Task['status']): Task[] {
  return tasks.filter(task => task.status === status)
}

/**
 * Filter tasks by tags
 */
export function filterTasksByTags(tasks: Task[], tags: string[]): Task[] {
  return tasks.filter(task =>
    tags.some(tag => task.tags.includes(tag))
  )
}

/**
 * Get urgent tasks (deadline within 7 days or priority > 70)
 */
export function getUrgentTasks(tasks: Task[]): Task[] {
  const now = new Date()

  return tasks.filter(task => {
    if (task.status === 'done') return false

    // High priority
    if (task.priority > 70) return true

    // Close deadline
    if (task.deadline) {
      const deadline = new Date(task.deadline)
      const daysUntil = differenceInDays(deadline, now)
      return daysUntil <= 7 && daysUntil >= 0
    }

    return false
  })
}

/**
 * Get overdue tasks
 */
export function getOverdueTasks(tasks: Task[]): Task[] {
  const now = new Date()

  return tasks.filter(task => {
    if (task.status === 'done' || !task.deadline) return false
    const deadline = new Date(task.deadline)
    return deadline < now
  })
}

/**
 * Get tasks due today
 */
export function getTasksDueToday(tasks: Task[]): Task[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  return tasks.filter(task => {
    if (task.status === 'done' || !task.deadline) return false
    const deadline = new Date(task.deadline)
    return deadline >= today && deadline < tomorrow
  })
}

/**
 * Export tasks as NDJSON
 */
export function exportTasksAsNDJSON(tasks: Task[]): string {
  return tasks.map(task => JSON.stringify(task)).join('\n')
}

/**
 * Import tasks from NDJSON
 */
export function importTasksFromNDJSON(ndjson: string): Task[] {
  return ndjson
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
}

/**
 * Update task priorities for all tasks
 */
export function updateTaskPriorities(tasks: Task[]): Task[] {
  return tasks.map(task => ({
    ...task,
    priority: calculateTaskPriority(task)
  }))
}
