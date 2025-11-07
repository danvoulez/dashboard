import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskStatus, TaskOrigin } from '@/types'
import { getTasks, saveTasks } from '@/utils/db'
import { calculateTaskPriority, sortTasksByPriority, getUrgentTasks, getOverdueTasks } from '@/utils/task'
import { createSpan } from '@/utils/span'
import { useAuthStore } from './auth'

export const useTaskStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const lastSync = ref<string | null>(null)

  const pendingTasks = computed(() => tasks.value.filter(t => t.status === 'pending'))
  const inProgressTasks = computed(() => tasks.value.filter(t => t.status === 'in_progress'))
  const completedTasks = computed(() => tasks.value.filter(t => t.status === 'done'))
  const urgentTasks = computed(() => getUrgentTasks(tasks.value))
  const overdueTasks = computed(() => getOverdueTasks(tasks.value))
  const sortedTasks = computed(() => sortTasksByPriority(tasks.value))

  async function loadTasks() {
    const span = createSpan({ name: 'tasks.load' })

    try {
      loading.value = true
      const loadedTasks = await getTasks()
      tasks.value = loadedTasks
      span.setAttribute('taskCount', loadedTasks.length)
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      loading.value = false
    }
  }

  async function syncTasks() {
    const span = createSpan({ name: 'tasks.sync' })

    try {
      await saveTasks(tasks.value)
      lastSync.value = new Date().toISOString()
      span.setAttribute('taskCount', tasks.value.length)
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function createTask(
    title: string,
    options: {
      description?: string
      tags?: string[]
      origin?: TaskOrigin
      assignedTo?: string
      deadline?: string
      spanId?: string
      metadata?: Record<string, any>
    } = {}
  ): Promise<Task> {
    const span = createSpan({
      name: 'tasks.create',
      attributes: { title, origin: options.origin }
    })

    try {
      const authStore = useAuthStore()
      const now = new Date().toISOString()

      const task: Task = {
        id: uuidv4(),
        title,
        description: options.description,
        tags: options.tags || [],
        origin: options.origin || 'manual',
        status: 'pending',
        assignedTo: options.assignedTo || authStore.user?.id,
        priority: 0,
        deadline: options.deadline,
        spanId: options.spanId || span.getSpan().id,
        metadata: options.metadata,
        createdAt: now,
        updatedAt: now
      }

      // Calculate initial priority
      task.priority = calculateTaskPriority(task)

      tasks.value.push(task)
      await syncTasks()

      span.addEvent('task_created', { taskId: task.id })
      await span.end('ok')

      return task
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function updateTask(id: string, updates: Partial<Task>) {
    const span = createSpan({
      name: 'tasks.update',
      attributes: { taskId: id }
    })

    try {
      const index = tasks.value.findIndex(t => t.id === id)
      if (index === -1) {
        throw new Error(`Task not found: ${id}`)
      }

      const updatedTask = {
        ...tasks.value[index],
        ...updates,
        updatedAt: new Date().toISOString()
      }

      // Recalculate priority if relevant fields changed
      if (updates.deadline !== undefined || updates.status !== undefined) {
        updatedTask.priority = calculateTaskPriority(updatedTask)
      }

      tasks.value[index] = updatedTask
      await syncTasks()

      span.addEvent('task_updated', { taskId: id, updates: Object.keys(updates) })
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function updateTaskStatus(id: string, status: TaskStatus) {
    await updateTask(id, { status })
  }

  async function deleteTask(id: string) {
    const span = createSpan({
      name: 'tasks.delete',
      attributes: { taskId: id }
    })

    try {
      const index = tasks.value.findIndex(t => t.id === id)
      if (index === -1) {
        throw new Error(`Task not found: ${id}`)
      }

      tasks.value.splice(index, 1)
      await syncTasks()

      span.addEvent('task_deleted', { taskId: id })
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function updateAllPriorities() {
    const span = createSpan({ name: 'tasks.updatePriorities' })

    try {
      tasks.value.forEach(task => {
        task.priority = calculateTaskPriority(task)
      })
      await syncTasks()
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  function getTaskById(id: string): Task | undefined {
    return tasks.value.find(t => t.id === id)
  }

  function getTasksByTag(tag: string): Task[] {
    return tasks.value.filter(t => t.tags.includes(tag))
  }

  function getTasksByAssignee(userId: string): Task[] {
    return tasks.value.filter(t => t.assignedTo === userId)
  }

  return {
    tasks,
    loading,
    lastSync,
    pendingTasks,
    inProgressTasks,
    completedTasks,
    urgentTasks,
    overdueTasks,
    sortedTasks,
    loadTasks,
    syncTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    updateAllPriorities,
    getTaskById,
    getTasksByTag,
    getTasksByAssignee
  }
})
