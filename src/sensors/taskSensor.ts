/**
 * Task Sensor
 *
 * Watches for spans and automatically creates tasks based on:
 * - Span attributes (deadline, critical, etc.)
 * - Span source (webhook, sensor, etc.)
 * - Urgency policy rules
 *
 * Flow: spans → taskFromSpan() → taskStore → urgencyPolicy
 */

import type { Span, Task } from '@/types'
import { taskFromSpan, shouldCreateTask, updateTaskFromSpan } from '@/utils/taskFromSpan'
import { computeUrgency } from '@/utils/urgencyPolicy'
import { createSpan, SpanBuilder } from '@/utils/span'
import { db } from '@/utils/db'

/**
 * Task Sensor Configuration
 */
export interface TaskSensorConfig {
  enabled: boolean
  autoCreateTasks: boolean
  autoUpdateUrgency: boolean
  deduplicationWindow: number // minutes
  minUrgencyForNotification: number
  notifyOnCritical: boolean
}

const DEFAULT_CONFIG: TaskSensorConfig = {
  enabled: true,
  autoCreateTasks: true,
  autoUpdateUrgency: true,
  deduplicationWindow: 5, // 5 minutes
  minUrgencyForNotification: 80,
  notifyOnCritical: true
}

/**
 * Task Sensor Class
 */
export class TaskSensor {
  private config: TaskSensorConfig
  private processedSpans: Set<string> = new Set()
  private cleanupInterval: number | null = null

  constructor(config: Partial<TaskSensorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.startCleanup()
  }

  /**
   * Process a span and potentially create a task
   */
  async processSpan(span: Span, taskStore?: any): Promise<Task | null> {
    if (!this.config.enabled || !this.config.autoCreateTasks) {
      return null
    }

    // Check if already processed (deduplication)
    if (this.processedSpans.has(span.id)) {
      console.log(`[TaskSensor] Span ${span.id} already processed, skipping`)
      return null
    }

    // Check if span should create a task
    if (!shouldCreateTask(span)) {
      console.log(`[TaskSensor] Span ${span.id} does not meet criteria for task creation`)
      return null
    }

    // Create tracking span
    const sensorSpan = new SpanBuilder()
      .setName('task_sensor.process_span')
      .setKind('internal')
      .setUserId(span.userId)
      .setParentSpanId(span.id)
      .setAttributes({
        sourceSpanId: span.id,
        sensorType: 'task_sensor',
        action: 'create_task'
      })
      .build()

    try {
      // Convert span to task
      const task = taskFromSpan(span)

      sensorSpan.addEvent('task_created', {
        taskId: task.id,
        title: task.title,
        urgency: task.urgency,
        critical: task.critical
      })

      // Add to task store if provided
      if (taskStore) {
        await taskStore.addTask(task)
        console.log(`[TaskSensor] Task created: ${task.title} (urgency: ${task.urgency})`)
      }

      // Mark span as processed
      this.processedSpans.add(span.id)

      // Notify if critical or high urgency
      if (this.config.notifyOnCritical && task.critical) {
        await this.notifyUser(task, 'critical')
      } else if (task.urgency >= this.config.minUrgencyForNotification) {
        await this.notifyUser(task, 'high_urgency')
      }

      sensorSpan.setStatus('ok')
      sensorSpan.end()

      // Save span to DB
      await db.spans.add(sensorSpan)

      return task
    } catch (error) {
      sensorSpan.setStatus('error')
      sensorSpan.addEvent('error', {
        error: error instanceof Error ? error.message : String(error)
      })
      sensorSpan.end()
      await db.spans.add(sensorSpan)

      console.error('[TaskSensor] Error processing span:', error)
      return null
    }
  }

  /**
   * Batch process multiple spans
   */
  async processSpans(spans: Span[], taskStore?: any): Promise<Task[]> {
    const tasks: Task[] = []

    for (const span of spans) {
      const task = await this.processSpan(span, taskStore)
      if (task) {
        tasks.push(task)
      }
    }

    return tasks
  }

  /**
   * Recalculate urgency for all tasks
   */
  async recalculateAllUrgencies(taskStore: any): Promise<void> {
    if (!this.config.autoUpdateUrgency) {
      return
    }

    const span = new SpanBuilder()
      .setName('task_sensor.recalculate_urgencies')
      .setKind('internal')
      .setAttributes({
        sensorType: 'task_sensor',
        action: 'recalculate_urgencies'
      })
      .build()

    try {
      const tasks = taskStore.tasks as Task[]
      let updated = 0

      for (const task of tasks) {
        const oldUrgency = task.urgency
        const result = computeUrgency(task)

        if (result.urgency !== oldUrgency) {
          task.urgency = result.urgency
          task.critical = result.critical
          updated++
        }
      }

      span.addEvent('urgencies_recalculated', {
        totalTasks: tasks.length,
        updated
      })

      span.setStatus('ok')
      console.log(`[TaskSensor] Recalculated urgencies for ${updated}/${tasks.length} tasks`)
    } catch (error) {
      span.setStatus('error')
      span.addEvent('error', {
        error: error instanceof Error ? error.message : String(error)
      })
      console.error('[TaskSensor] Error recalculating urgencies:', error)
    } finally {
      span.end()
      await db.spans.add(span)
    }
  }

  /**
   * Update existing task from new span
   */
  async updateTaskFromNewSpan(
    taskId: string,
    span: Span,
    taskStore: any
  ): Promise<void> {
    const task = taskStore.tasks.find((t: Task) => t.id === taskId)
    if (!task) {
      console.warn(`[TaskSensor] Task ${taskId} not found`)
      return
    }

    const updatedTask = updateTaskFromSpan(task, span)
    await taskStore.updateTask(taskId, updatedTask)

    console.log(`[TaskSensor] Task ${taskId} updated from span ${span.id}`)
  }

  /**
   * Send notification to user
   */
  private async notifyUser(task: Task, type: 'critical' | 'high_urgency'): Promise<void> {
    // Check if browser supports notifications
    if (!('Notification' in window)) {
      return
    }

    // Request permission if needed
    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }

    if (Notification.permission !== 'granted') {
      return
    }

    const title = type === 'critical'
      ? `🔥 Critical Task: ${task.title}`
      : `⚡ Urgent Task: ${task.title}`

    const body = task.description || `Urgency: ${task.urgency}/100`

    new Notification(title, {
      body,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: task.id,
      requireInteraction: type === 'critical'
    })
  }

  /**
   * Start periodic cleanup of processed spans
   */
  private startCleanup(): void {
    const cleanupMs = this.config.deduplicationWindow * 60 * 1000

    this.cleanupInterval = window.setInterval(() => {
      console.log(`[TaskSensor] Cleaning up processed spans (${this.processedSpans.size} entries)`)
      this.processedSpans.clear()
    }, cleanupMs)
  }

  /**
   * Stop the sensor
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.processedSpans.clear()
  }

  /**
   * Get sensor status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      processedSpans: this.processedSpans.size,
      config: this.config
    }
  }
}

/**
 * Global task sensor instance
 */
export let taskSensor: TaskSensor | null = null

/**
 * Initialize task sensor
 */
export function initTaskSensor(config?: Partial<TaskSensorConfig>): TaskSensor {
  if (taskSensor) {
    taskSensor.stop()
  }

  taskSensor = new TaskSensor(config)
  console.log('[TaskSensor] Initialized')

  return taskSensor
}

/**
 * Get or create task sensor
 */
export function getTaskSensor(): TaskSensor {
  if (!taskSensor) {
    taskSensor = initTaskSensor()
  }
  return taskSensor
}

/**
 * Stop task sensor
 */
export function stopTaskSensor(): void {
  if (taskSensor) {
    taskSensor.stop()
    taskSensor = null
    console.log('[TaskSensor] Stopped')
  }
}
