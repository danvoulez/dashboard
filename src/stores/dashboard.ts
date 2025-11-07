import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DashboardState, FocusSession } from '@/types'
import { getActiveFocusSession, saveFocusSession } from '@/utils/db'
import { createSpan } from '@/utils/span'
import { v4 as uuidv4 } from 'uuid'
import { useTaskStore } from './tasks'

export const useDashboardStore = defineStore('dashboard', () => {
  const darkMode = ref(false)
  const sidebarCollapsed = ref(false)
  const activeFocus = ref<FocusSession | null>(null)
  const lastSync = ref<string | null>(null)
  const dailyProgress = ref({
    tasksCompleted: 0,
    focusTime: 0,
    spansExecuted: 0
  })

  const focusTime = computed(() => {
    if (!activeFocus.value) return 0
    const start = new Date(activeFocus.value.startTime).getTime()
    const now = Date.now()
    return Math.floor((now - start) / 1000) // seconds
  })

  async function toggleDarkMode() {
    darkMode.value = !darkMode.value
    document.documentElement.classList.toggle('dark', darkMode.value)
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  async function startFocus(taskId?: string, pluginId?: string) {
    const span = createSpan({
      name: 'focus.start',
      attributes: { taskId, pluginId }
    })

    try {
      if (activeFocus.value) {
        await endFocus()
      }

      const session: FocusSession = {
        id: uuidv4(),
        taskId,
        pluginId,
        startTime: new Date().toISOString(),
        spanId: span.getSpan().id
      }

      activeFocus.value = session
      await saveFocusSession(session)

      span.addEvent('focus_started', { sessionId: session.id })
      await span.end('ok')

      // Update task status if focusing on a task
      if (taskId) {
        const taskStore = useTaskStore()
        await taskStore.updateTaskStatus(taskId, 'in_progress')
      }
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function endFocus() {
    const span = createSpan({ name: 'focus.end' })

    try {
      if (!activeFocus.value) {
        throw new Error('No active focus session')
      }

      const endTime = new Date().toISOString()
      const startTime = new Date(activeFocus.value.startTime).getTime()
      const duration = Math.floor((new Date(endTime).getTime() - startTime) / 1000)

      activeFocus.value.endTime = endTime
      activeFocus.value.duration = duration

      await saveFocusSession(activeFocus.value)

      // Update daily progress
      dailyProgress.value.focusTime += duration

      span.addEvent('focus_ended', {
        sessionId: activeFocus.value.id,
        duration
      })

      activeFocus.value = null
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function loadActiveFocus() {
    const session = await getActiveFocusSession()
    if (session) {
      activeFocus.value = session
    }
  }

  function updateDailyProgress(updates: Partial<DashboardState['dailyProgress']>) {
    dailyProgress.value = { ...dailyProgress.value, ...updates }
  }

  function resetDailyProgress() {
    dailyProgress.value = {
      tasksCompleted: 0,
      focusTime: 0,
      spansExecuted: 0
    }
  }

  return {
    darkMode,
    sidebarCollapsed,
    activeFocus,
    lastSync,
    dailyProgress,
    focusTime,
    toggleDarkMode,
    toggleSidebar,
    startFocus,
    endFocus,
    loadActiveFocus,
    updateDailyProgress,
    resetDailyProgress
  }
}, {
  persist: {
    storage: localStorage,
    paths: ['darkMode', 'sidebarCollapsed', 'dailyProgress']
  }
})
