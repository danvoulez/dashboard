<template>
  <div class="settings-view">
    <div class="settings-header">
      <h1>Settings</h1>
      <p class="text-secondary">Configure your Radar Dashboard experience.</p>
    </div>

    <div class="settings-sections">
      <!-- Appearance -->
      <div class="card settings-section">
        <h2>Appearance</h2>

        <div class="setting-item">
          <div class="setting-info">
            <h3>Dark Mode</h3>
            <p class="text-sm text-secondary">Use dark theme for better viewing in low light</p>
          </div>
          <button @click="dashboardStore.toggleDarkMode()" class="btn-secondary">
            {{ dashboardStore.darkMode ? 'Disable' : 'Enable' }}
          </button>
        </div>
      </div>

      <!-- LLM Configuration -->
      <div class="card settings-section">
        <h2>LLM Integration</h2>

        <div class="setting-item">
          <div class="setting-info">
            <label for="llm-provider" class="setting-label">Provider</label>
            <select
              id="llm-provider"
              v-model="llmStore.config.provider"
              class="input"
              @change="handleLLMConfigChange"
            >
              <option value="openai">OpenAI</option>
              <option value="macmind">MacMind Gateway</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <label for="llm-model" class="setting-label">Model</label>
            <input
              id="llm-model"
              v-model="llmStore.config.model"
              type="text"
              class="input"
              placeholder="e.g., gpt-4"
              @change="handleLLMConfigChange"
            />
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <label for="llm-api-key" class="setting-label">API Key</label>
            <input
              id="llm-api-key"
              v-model="llmStore.config.apiKey"
              type="password"
              class="input"
              placeholder="Enter your API key"
              @change="handleLLMConfigChange"
            />
          </div>
        </div>
      </div>

      <!-- User Info -->
      <div class="card settings-section">
        <h2>Account</h2>

        <div class="setting-item">
          <div class="setting-info">
            <h3>{{ authStore.user?.name }}</h3>
            <p class="text-sm text-secondary">{{ authStore.user?.email }}</p>
            <p class="text-xs text-tertiary">Provider: {{ authStore.user?.provider }}</p>
          </div>
        </div>

        <div class="setting-item">
          <button @click="handleLogout" class="btn-error">Logout</button>
        </div>
      </div>

      <!-- Data Management -->
      <div class="card settings-section">
        <h2>Data Management</h2>

        <div class="setting-item">
          <div class="setting-info">
            <h3>Export Data</h3>
            <p class="text-sm text-secondary">Export your tasks and data as NDJSON</p>
          </div>
          <button @click="handleExport" class="btn-secondary">Export</button>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <h3>Last Sync</h3>
            <p class="text-sm text-secondary">{{ taskStore.lastSync || 'Never' }}</p>
          </div>
          <button @click="handleSync" class="btn-secondary">Sync Now</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useDashboardStore } from '@/stores/dashboard'
import { useAuthStore } from '@/stores/auth'
import { useLLMStore } from '@/stores/llm'
import { useTaskStore } from '@/stores/tasks'
import { exportTasksAsNDJSON } from '@/utils/task'

const router = useRouter()
const dashboardStore = useDashboardStore()
const authStore = useAuthStore()
const llmStore = useLLMStore()
const taskStore = useTaskStore()

function handleLLMConfigChange() {
  // Config is automatically persisted via pinia-plugin-persistedstate
  console.log('LLM config updated:', llmStore.config)
}

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}

async function handleSync() {
  await taskStore.syncTasks()
  alert('Data synced successfully!')
}

function handleExport() {
  const ndjson = exportTasksAsNDJSON(taskStore.tasks)
  const blob = new Blob([ndjson], { type: 'application/x-ndjson' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `radar-tasks-${new Date().toISOString()}.ndjson`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.settings-view {
  padding: var(--spacing-lg);
  max-width: 800px;
  margin: 0 auto;
}

.settings-header {
  margin-bottom: var(--spacing-xl);
}

.settings-sections {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-lg);
  padding-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.setting-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.setting-info {
  flex: 1;
  min-width: 0;
}

.setting-label {
  display: block;
  margin-bottom: var(--spacing-sm);
  font-weight: 500;
  font-size: 0.875rem;
}

.btn-error {
  background-color: var(--error);
  color: white;
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--transition-base);
}

.btn-error:hover {
  opacity: 0.9;
}
</style>
