<template>
  <div class="task-panel" :class="{ 'panel-collapsed': collapsed }">
    <!-- Header -->
    <div class="panel-header">
      <h3 class="panel-title">
        <span v-if="!collapsed">Tarefas por Urgência</span>
        <button @click="collapsed = !collapsed" class="collapse-btn">
          {{ collapsed ? '◀' : '▶' }}
        </button>
      </h3>
      <div v-if="!collapsed" class="panel-stats">
        <span class="stat">
          <span class="stat-icon critical">🔥</span>
          {{ criticalTasks.length }}
        </span>
        <span class="stat">
          <span class="stat-icon high">⚡</span>
          {{ highUrgencyTasks.length }}
        </span>
        <span class="stat">
          <span class="stat-icon total">📋</span>
          {{ activeTasks.length }}
        </span>
      </div>
    </div>

    <!-- Filters -->
    <div v-if="!collapsed" class="panel-filters">
      <button
        v-for="filter in filters"
        :key="filter.value"
        @click="activeFilter = filter.value"
        :class="['filter-btn', { active: activeFilter === filter.value }]"
      >
        {{ filter.label }}
      </button>
    </div>

    <!-- Search & Sort -->
    <div v-if="!collapsed && showSearch" class="panel-search">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Buscar tarefas..."
        class="search-input"
      />
      <select v-model="sortBy" class="sort-select">
        <option value="urgency">Urgência</option>
        <option value="dueDate">Data Limite</option>
        <option value="created">Criação</option>
      </select>
    </div>

    <!-- Task List -->
    <div v-if="!collapsed" class="task-list" ref="taskListEl">
      <div v-if="loading" class="task-loading">
        Carregando tarefas...
      </div>

      <div v-else-if="filteredTasks.length === 0" class="task-empty">
        <p>Nenhuma tarefa encontrada</p>
      </div>

      <div
        v-else
        v-for="task in filteredTasks"
        :key="task.id"
        :class="['task-item', getUrgencyClass(task.urgency)]"
        @click="selectTask(task)"
      >
        <!-- Urgency Bar -->
        <div
          class="urgency-bar"
          :style="{ width: `${task.urgency}%`, backgroundColor: getUrgencyColor(task.urgency) }"
        ></div>

        <!-- Task Content -->
        <div class="task-content">
          <div class="task-header-row">
            <span v-if="task.critical" class="critical-badge">🔥</span>
            <span class="task-title">{{ task.title }}</span>
          </div>

          <div class="task-meta">
            <span class="task-urgency" :style="{ color: getUrgencyColor(task.urgency) }">
              {{ task.urgency }} urgência
            </span>
            <span v-if="task.source" class="task-source">
              {{ task.source }}
            </span>
          </div>

          <div v-if="task.dueDate || task.deadline" class="task-due">
            <span :class="{ overdue: isOverdue(task) }">
              {{ formatDueDate(task.dueDate || task.deadline) }}
            </span>
          </div>

          <div v-if="task.tags.length > 0" class="task-tags">
            <span
              v-for="tag in task.tags.slice(0, 3)"
              :key="tag"
              class="task-tag"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Actions -->
        <div class="task-actions">
          <button @click.stop="resolveTask(task.id)" class="action-btn resolve">
            ✓
          </button>
          <button @click.stop="openSpan(task)" class="action-btn view">
            👁️
          </button>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div v-if="!collapsed" class="panel-footer">
      <button @click="refreshTasks" class="refresh-btn">
        🔄 Atualizar
      </button>
      <button @click="showSearch = !showSearch" class="search-toggle-btn">
        🔍
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { useAuthStore } from '@/stores/auth'
import type { Task } from '@/types'
import { getUrgencyColor, getUrgencyLevel } from '@/utils/urgencyPolicy'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Stores
const taskStore = useTaskStore()
const authStore = useAuthStore()

// State
const collapsed = ref(false)
const loading = ref(false)
const searchQuery = ref('')
const activeFilter = ref('all')
const sortBy = ref('urgency')
const showSearch = ref(false)
const taskListEl = ref<HTMLElement | null>(null)
const refreshInterval = ref<number | null>(null)

// Filters
const filters = [
  { label: 'Todas', value: 'all' },
  { label: 'Críticas', value: 'critical' },
  { label: 'Alta', value: 'high' },
  { label: 'Média', value: 'medium' },
  { label: 'Por Sensor', value: 'sensor' }
]

// Computed
const activeTasks = computed(() => {
  const userId = authStore.user?.id
  return userId ? taskStore.getSortedByUrgency(userId) : taskStore.tasksSortedByUrgency
})

const criticalTasks = computed(() =>
  activeTasks.value.filter(t => t.critical)
)

const highUrgencyTasks = computed(() =>
  activeTasks.value.filter(t => t.urgency >= 70 && !t.critical)
)

const filteredTasks = computed(() => {
  let tasks = activeTasks.value

  // Apply filter
  if (activeFilter.value === 'critical') {
    tasks = tasks.filter(t => t.critical)
  } else if (activeFilter.value === 'high') {
    tasks = tasks.filter(t => t.urgency >= 70)
  } else if (activeFilter.value === 'medium') {
    tasks = tasks.filter(t => t.urgency >= 40 && t.urgency < 70)
  } else if (activeFilter.value === 'sensor') {
    tasks = tasks.filter(t => t.source && t.source !== 'unknown')
  }

  // Apply search
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.tags.some(tag => tag.toLowerCase().includes(query))
    )
  }

  // Apply sort
  if (sortBy.value === 'dueDate') {
    tasks = [...tasks].sort((a, b) => {
      const dateA = a.dueDate || a.deadline
      const dateB = b.dueDate || b.deadline
      if (!dateA && !dateB) return 0
      if (!dateA) return 1
      if (!dateB) return -1
      return new Date(dateA).getTime() - new Date(dateB).getTime()
    })
  } else if (sortBy.value === 'created') {
    tasks = [...tasks].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }
  // 'urgency' is already sorted by default

  return tasks
})

// Methods
function getUrgencyClass(urgency: number): string {
  if (urgency >= 90) return 'urgency-critical'
  if (urgency >= 70) return 'urgency-high'
  if (urgency >= 50) return 'urgency-medium'
  if (urgency >= 30) return 'urgency-low'
  return 'urgency-minimal'
}

function isOverdue(task: Task): boolean {
  const dueDate = task.dueDate || task.deadline
  return dueDate ? new Date(dueDate) < new Date() : false
}

function formatDueDate(dateStr: string | undefined): string {
  if (!dateStr) return ''
  try {
    return formatDistanceToNow(new Date(dateStr), {
      addSuffix: true,
      locale: ptBR
    })
  } catch {
    return dateStr
  }
}

async function resolveTask(id: string) {
  try {
    await taskStore.resolveTask(id)
    console.log(`[TaskPanel] Task ${id} resolved`)
  } catch (error) {
    console.error('[TaskPanel] Error resolving task:', error)
  }
}

function selectTask(task: Task) {
  console.log('[TaskPanel] Task selected:', task)
  // TODO: Emit event or navigate to task detail
}

function openSpan(task: Task) {
  if (task.spanId) {
    console.log('[TaskPanel] Opening span:', task.spanId)
    // TODO: Navigate to span view or open modal
  }
}

async function refreshTasks() {
  loading.value = true
  try {
    await taskStore.autoReorder()
    console.log('[TaskPanel] Tasks refreshed')
  } catch (error) {
    console.error('[TaskPanel] Error refreshing tasks:', error)
  } finally {
    loading.value = false
  }
}

// Lifecycle
onMounted(() => {
  // Auto-refresh every 5 minutes
  refreshInterval.value = window.setInterval(() => {
    taskStore.autoReorder()
  }, 5 * 60 * 1000)

  console.log('[TaskPanel] Mounted')
})

onUnmounted(() => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
  }
})
</script>

<style scoped>
.task-panel {
  position: fixed;
  right: 0;
  top: 0;
  height: 100vh;
  width: 360px;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, transform 0.3s ease;
  z-index: 1000;
  overflow: hidden;
}

.panel-collapsed {
  width: 48px;
}

.panel-header {
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
}

.panel-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #f1f5f9;
}

.collapse-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  color: #f1f5f9;
  cursor: pointer;
  transition: background 0.2s;
}

.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.panel-stats {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
}

.stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: #cbd5e1;
}

.stat-icon {
  font-size: 1rem;
}

.panel-filters {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-wrap: wrap;
}

.filter-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  color: #cbd5e1;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.filter-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.panel-search {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.search-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.5rem;
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 0.875rem;
}

.search-input::placeholder {
  color: #64748b;
}

.sort-select {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.5rem;
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 0.875rem;
  cursor: pointer;
}

.task-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.task-loading,
.task-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #64748b;
  font-size: 0.875rem;
}

.task-item {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  padding: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.task-item:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateX(-2px);
}

.urgency-bar {
  position: absolute;
  left: 0;
  top: 0;
  height: 3px;
  transition: width 0.3s ease;
}

.task-content {
  margin-top: 0.5rem;
}

.task-header-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.critical-badge {
  font-size: 1rem;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.task-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: #f1f5f9;
  line-height: 1.4;
}

.task-meta {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
}

.task-urgency {
  font-weight: 600;
}

.task-source {
  color: #94a3b8;
}

.task-due {
  font-size: 0.75rem;
  color: #cbd5e1;
  margin-bottom: 0.5rem;
}

.overdue {
  color: #ef4444;
  font-weight: 600;
}

.task-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.task-tag {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.625rem;
}

.task-actions {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.task-item:hover .task-actions {
  opacity: 1;
}

.action-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  padding: 0.375rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.action-btn.resolve {
  color: #10b981;
}

.action-btn.view {
  color: #3b82f6;
}

.panel-footer {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
}

.refresh-btn,
.search-toggle-btn {
  flex: 1;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  padding: 0.5rem;
  border-radius: 6px;
  color: #93c5fd;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover,
.search-toggle-btn:hover {
  background: rgba(59, 130, 246, 0.3);
}

/* Urgency Classes */
.urgency-critical {
  border-left: 3px solid #dc2626;
}

.urgency-high {
  border-left: 3px solid #ea580c;
}

.urgency-medium {
  border-left: 3px solid #f59e0b;
}

.urgency-low {
  border-left: 3px solid #3b82f6;
}

.urgency-minimal {
  border-left: 3px solid #6b7280;
}

/* Scrollbar */
.task-list::-webkit-scrollbar {
  width: 6px;
}

.task-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
}

.task-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.task-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
