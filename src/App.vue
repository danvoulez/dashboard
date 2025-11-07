<template>
  <div id="app" :class="{ dark: dashboardStore.darkMode }">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { useTaskStore } from '@/stores/tasks'
import { usePluginStore } from '@/stores/plugins'
import { initDB } from '@/utils/db'

const dashboardStore = useDashboardStore()
const taskStore = useTaskStore()
const pluginStore = usePluginStore()

onMounted(async () => {
  // Initialize IndexedDB
  await initDB()

  // Load data
  await taskStore.loadTasks()
  await pluginStore.loadPlugins()
  await dashboardStore.loadActiveFocus()

  // Apply dark mode if enabled
  if (dashboardStore.darkMode) {
    document.documentElement.classList.add('dark')
  }
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
