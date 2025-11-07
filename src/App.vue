<template>
  <div id="app" :class="{ dark: dashboardStore.darkMode }">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { useTaskStore } from '@/stores/tasks'
import { usePluginStore } from '@/stores/plugins'
import { useUploadStore } from '@/stores/uploads'
import { useAuthStore } from '@/stores/auth'
import { initDB } from '@/utils/db'
import { startObserverBot, stopObserverBot } from '@/execution/observer_bot'
import { getPolicyAgent } from '@/execution/policy_agent'
import { initTaskSensor } from '@/sensors/taskSensor'
import { initSyncManager } from '@/utils/syncManager'

const dashboardStore = useDashboardStore()
const taskStore = useTaskStore()
const pluginStore = usePluginStore()
const uploadStore = useUploadStore()
const authStore = useAuthStore()

onMounted(async () => {
  // Initialize IndexedDB
  await initDB()

  // Check authentication session
  authStore.checkSession()

  // Load data
  await taskStore.loadTasks()
  await pluginStore.loadPlugins()
  await uploadStore.loadUploads()
  await dashboardStore.loadActiveFocus()

  // Initialize policy agent
  const policyAgent = getPolicyAgent()
  await policyAgent.loadPolicies()

  // Start observer bot for automatic task creation from spans
  if (authStore.isAuthenticated) {
    startObserverBot(10000) // Check every 10 seconds
  }

  // Initialize Task Sensor for span → task transformation
  const taskSensor = initTaskSensor({
    enabled: true,
    autoCreateTasks: true,
    autoUpdateUrgency: true,
    notifyOnCritical: true
  })
  console.log('[App] Task Sensor initialized')

  // Initialize Sync Manager for offline support
  await initSyncManager({
    autoSync: true,
    syncIntervalSeconds: 30
  })
  console.log('[App] Sync Manager initialized')

  // Update task priorities and urgencies daily
  setInterval(async () => {
    await taskStore.updateAllPriorities()
    await taskStore.autoReorder() // Recalculate urgencies
  }, 24 * 60 * 60 * 1000) // Every 24 hours

  // Auto-recalculate urgencies every 5 minutes
  setInterval(async () => {
    await taskStore.autoReorder()
  }, 5 * 60 * 1000) // Every 5 minutes

  // Apply dark mode if enabled
  if (dashboardStore.darkMode) {
    document.documentElement.classList.add('dark')
  }

  // Log initialization span
  console.log('Radar Dashboard initialized')
})

onUnmounted(() => {
  // Stop observer bot
  stopObserverBot()
})
</script>

<style>
#app {
  width: 100%;
  min-height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color 0.3s, color 0.3s;
}
</style>
