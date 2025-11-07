/**
 * Urgency Policy Calculator
 *
 * Calculates task urgency (0-100) based on rules:
 * - critical == true: 100
 * - dueDate in <1h: 90
 * - dueDate in <6h: 80
 * - dueDate in <24h: 70
 * - dueDate in <48h: 50
 * - dueDate expired: 95
 * - createdAt > 7d && not persistent: 20
 * - default: 40
 */

import type { Task, UrgencyRule, UrgencyPolicyResult } from '@/types'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * Calculate time until due date in milliseconds
 */
function getTimeToDueDate(task: Task): number | null {
  const dueDate = task.dueDate || task.deadline
  if (!dueDate) return null

  return new Date(dueDate).getTime() - Date.now()
}

/**
 * Calculate days since creation
 */
function getDaysSinceCreation(task: Task): number {
  const created = new Date(task.createdAt).getTime()
  return (Date.now() - created) / DAY_MS
}

/**
 * Check if task is persistent (has metadata.persistent flag)
 */
function isPersistent(task: Task): boolean {
  return task.metadata?.persistent === true
}

/**
 * Urgency rules in priority order
 */
export const urgencyRules: UrgencyRule[] = [
  {
    condition: (task) => task.critical === true,
    urgency: 100,
    description: 'Critical task (emergency flag)'
  },
  {
    condition: (task) => {
      const timeTo = getTimeToDueDate(task)
      return timeTo !== null && timeTo < 0
    },
    urgency: 95,
    description: 'Due date expired (overdue)'
  },
  {
    condition: (task) => {
      const timeTo = getTimeToDueDate(task)
      return timeTo !== null && timeTo > 0 && timeTo < HOUR_MS
    },
    urgency: 90,
    description: 'Due in less than 1 hour'
  },
  {
    condition: (task) => {
      const timeTo = getTimeToDueDate(task)
      return timeTo !== null && timeTo >= HOUR_MS && timeTo < 6 * HOUR_MS
    },
    urgency: 80,
    description: 'Due in less than 6 hours'
  },
  {
    condition: (task) => {
      const timeTo = getTimeToDueDate(task)
      return timeTo !== null && timeTo >= 6 * HOUR_MS && timeTo < DAY_MS
    },
    urgency: 70,
    description: 'Due in less than 24 hours'
  },
  {
    condition: (task) => {
      const timeTo = getTimeToDueDate(task)
      return timeTo !== null && timeTo >= DAY_MS && timeTo < 2 * DAY_MS
    },
    urgency: 50,
    description: 'Due in less than 48 hours'
  },
  {
    condition: (task) => {
      const daysSince = getDaysSinceCreation(task)
      return daysSince > 7 && !isPersistent(task)
    },
    urgency: 20,
    description: 'Old task (>7 days, not persistent)'
  }
]

/**
 * Calculate urgency for a task based on rules
 */
export function computeUrgency(task: Task): UrgencyPolicyResult {
  // Check if task is already resolved
  if (task.resolved || task.status === 'done') {
    return {
      urgency: 0,
      matchedRule: 'Task is resolved/done',
      critical: false
    }
  }

  // Evaluate rules in order
  for (const rule of urgencyRules) {
    if (rule.condition(task)) {
      return {
        urgency: rule.urgency,
        matchedRule: rule.description,
        critical: task.critical || rule.urgency >= 95
      }
    }
  }

  // Default urgency
  return {
    urgency: 40,
    matchedRule: 'Default urgency (no specific rules matched)',
    critical: false
  }
}

/**
 * Recalculate urgency for multiple tasks
 */
export function recalculateUrgencies(tasks: Task[]): Map<string, UrgencyPolicyResult> {
  const results = new Map<string, UrgencyPolicyResult>()

  for (const task of tasks) {
    const result = computeUrgency(task)
    results.set(task.id, result)
  }

  return results
}

/**
 * Sort tasks by urgency (descending)
 */
export function sortByUrgency(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const urgencyA = computeUrgency(a).urgency
    const urgencyB = computeUrgency(b).urgency
    return urgencyB - urgencyA
  })
}

/**
 * Get tasks with urgency above threshold
 */
export function getUrgentTasks(tasks: Task[], threshold: number = 70): Task[] {
  return tasks.filter(task => {
    const result = computeUrgency(task)
    return result.urgency >= threshold
  })
}

/**
 * Get urgency level label
 */
export function getUrgencyLevel(urgency: number): string {
  if (urgency >= 90) return 'CRITICAL'
  if (urgency >= 70) return 'HIGH'
  if (urgency >= 50) return 'MEDIUM'
  if (urgency >= 30) return 'LOW'
  return 'MINIMAL'
}

/**
 * Get urgency color for UI
 */
export function getUrgencyColor(urgency: number): string {
  if (urgency >= 90) return '#dc2626' // red-600
  if (urgency >= 70) return '#ea580c' // orange-600
  if (urgency >= 50) return '#f59e0b' // amber-500
  if (urgency >= 30) return '#3b82f6' // blue-500
  return '#6b7280' // gray-500
}
