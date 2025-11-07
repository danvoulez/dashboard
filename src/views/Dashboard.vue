<template>
  <div class="dashboard">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ collapsed: dashboardStore.sidebarCollapsed }">
      <div class="sidebar-header">
        <h2 v-if="!dashboardStore.sidebarCollapsed">Radar</h2>
        <button @click="dashboardStore.toggleSidebar()" class="btn-icon">
          {{ dashboardStore.sidebarCollapsed ? '→' : '←' }}
        </button>
      </div>

      <nav class="sidebar-nav">
        <router-link to="/" class="nav-item">
          <span class="nav-icon">📊</span>
          <span v-if="!dashboardStore.sidebarCollapsed" class="nav-label">Dashboard</span>
        </router-link>

        <router-link to="/tasks" class="nav-item">
          <span class="nav-icon">✓</span>
          <span v-if="!dashboardStore.sidebarCollapsed" class="nav-label">Tasks</span>
          <span v-if="!dashboardStore.sidebarCollapsed && taskStore.pendingTasks.length > 0" class="badge badge-primary">
            {{ taskStore.pendingTasks.length }}
          </span>
        </router-link>

        <router-link to="/timeline" class="nav-item">
          <span class="nav-icon">⏱</span>
          <span v-if="!dashboardStore.sidebarCollapsed" class="nav-label">Timeline</span>
        </router-link>

        <router-link to="/plugins" class="nav-item">
          <span class="nav-icon">🔌</span>
          <span v-if="!dashboardStore.sidebarCollapsed" class="nav-label">Plugins</span>
        </router-link>

        <router-link to="/settings" class="nav-item">
          <span class="nav-icon">⚙</span>
          <span v-if="!dashboardStore.sidebarCollapsed" class="nav-label">Settings</span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <button @click="dashboardStore.toggleDarkMode()" class="btn-icon">
          {{ dashboardStore.darkMode ? '☀️' : '🌙' }}
        </button>
        <button v-if="!dashboardStore.sidebarCollapsed" @click="handleLogout" class="btn-secondary btn-sm">
          Logout
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Status Bar -->
      <div class="status-bar">
        <div class="status-item">
          <span class="status-label">Focus Time:</span>
          <span class="status-value">{{ formatTime(dashboardStore.focusTime) }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Last Sync:</span>
          <span class="status-value">{{ formatLastSync() }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Progress:</span>
          <span class="status-value">{{ dashboardStore.dailyProgress.tasksCompleted }} tasks</span>
        </div>
      </div>

      <!-- Content Area -->
      <div class="content-area">
        <div class="content-main">
          <!-- Dashboard Summary -->
          <div class="dashboard-summary">
            <h1>Dashboard</h1>

            <div class="summary-cards">
              <div class="card summary-card">
                <h3>Urgent Tasks</h3>
                <div class="summary-value">{{ taskStore.urgentTasks.length }}</div>
                <p class="text-secondary text-sm">Require immediate attention</p>
              </div>

              <div class="card summary-card">
                <h3>In Progress</h3>
                <div class="summary-value">{{ taskStore.inProgressTasks.length }}</div>
                <p class="text-secondary text-sm">Currently working on</p>
              </div>

              <div class="card summary-card">
                <h3>Completed Today</h3>
                <div class="summary-value">{{ dashboardStore.dailyProgress.tasksCompleted }}</div>
                <p class="text-secondary text-sm">Tasks done today</p>
              </div>

              <div class="card summary-card">
                <h3>Total Pending</h3>
                <div class="summary-value">{{ taskStore.pendingTasks.length }}</div>
                <p class="text-secondary text-sm">Waiting to be started</p>
              </div>
            </div>

            <!-- Urgent Tasks List -->
            <div class="card">
              <h2>Urgent Tasks</h2>
              <div v-if="taskStore.urgentTasks.length === 0" class="empty-state">
                <p class="text-secondary">No urgent tasks at the moment</p>
              </div>
              <div v-else class="task-list">
                <div
                  v-for="task in taskStore.urgentTasks.slice(0, 5)"
                  :key="task.id"
                  class="task-item"
                >
                  <div class="task-info">
                    <h4>{{ task.title }}</h4>
                    <div class="task-meta">
                      <span class="badge" :class="`badge-${getStatusColor(task.status)}`">
                        {{ task.status }}
                      </span>
                      <span class="text-xs text-secondary">Priority: {{ task.priority }}</span>
                      <span v-if="task.deadline" class="text-xs text-secondary">
                        Due: {{ formatDate(task.deadline) }}
                      </span>
                    </div>
                  </div>
                  <button @click="startTaskFocus(task.id)" class="btn-primary btn-sm">
                    Focus
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </main>

    <!-- New Task Panel with Urgency System -->
    <TaskPanel />

    <!-- Add Task Modal (simplified) -->
    <div v-if="showAddTask" class="modal-overlay" @click.self="showAddTask = false">
      <div class="modal card">
        <h2>Add New Task</h2>
        <form @submit.prevent="handleAddTask">
          <input
            v-model="newTaskTitle"
            type="text"
            placeholder="Task title"
            class="input mb-md"
            required
          />
          <div class="flex gap-md">
            <button type="submit" class="btn-primary">Create</button>
            <button type="button" @click="showAddTask = false" class="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboardStore } from '@/stores/dashboard'
import { useTaskStore } from '@/stores/tasks'
import { useAuthStore } from '@/stores/auth'
import { formatDistanceToNow } from 'date-fns'
import TaskPanel from '@/components/TaskPanel.vue'

const router = useRouter()
const dashboardStore = useDashboardStore()
const taskStore = useTaskStore()
const authStore = useAuthStore()

const showAddTask = ref(false)
const newTaskTitle = ref('')

let focusInterval: number | null = null

onMounted(() => {
  // Update focus time every second
  focusInterval = window.setInterval(() => {
    if (dashboardStore.activeFocus) {
      // Force reactivity update
      dashboardStore.activeFocus = { ...dashboardStore.activeFocus }
    }
  }, 1000)
})

onUnmounted(() => {
  if (focusInterval) {
    clearInterval(focusInterval)
  }
})

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  } else {
    return `${secs}s`
  }
}

function formatLastSync(): string {
  if (!taskStore.lastSync) return 'Never'
  return formatDistanceToNow(new Date(taskStore.lastSync), { addSuffix: true })
}

function formatDate(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true })
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending': return 'warning'
    case 'in_progress': return 'info'
    case 'done': return 'success'
    default: return 'secondary'
  }
}

async function startTaskFocus(taskId: string) {
  await dashboardStore.startFocus(taskId)
}

async function handleAddTask() {
  if (!newTaskTitle.value.trim()) return

  await taskStore.createTask(newTaskTitle.value)
  newTaskTitle.value = ''
  showAddTask.value = false
}

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.dashboard {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 250px;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: width var(--transition-base);
}

.sidebar.collapsed {
  width: 60px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.sidebar-nav {
  flex: 1;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  text-decoration: none;
  transition: background-color var(--transition-base);
}

.nav-item:hover {
  background-color: var(--bg-tertiary);
}

.nav-item.router-link-active {
  background-color: var(--accent-primary);
  color: white;
}

.nav-icon {
  font-size: 1.25rem;
}

.sidebar-footer {
  padding: var(--spacing-md);
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: var(--spacing-sm);
}

/* Main Content */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-md) var(--spacing-lg);
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.status-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 0.875rem;
}

.status-label {
  color: var(--text-secondary);
}

.status-value {
  font-weight: 500;
  color: var(--text-primary);
}

.content-area {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.content-main {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
  margin-right: 360px; /* Make space for TaskPanel */
}

/* Dashboard Summary */
.dashboard-summary {
  max-width: 1200px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
}

.summary-card {
  text-align: center;
}

.summary-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--accent-primary);
  margin: var(--spacing-md) 0;
}

/* Task Panel is now in TaskPanel.vue component */

/* Task List */
.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--bg-secondary);
  transition: background-color var(--transition-base);
}

.task-item:hover {
  background-color: var(--bg-tertiary);
}

.task-item.compact {
  padding: var(--spacing-sm);
}

.task-info {
  flex: 1;
  min-width: 0;
}

.task-info h4 {
  margin-bottom: var(--spacing-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.task-tags {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
  margin-top: var(--spacing-xs);
}

.priority-indicator {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--accent-primary);
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  max-width: 500px;
  width: 90%;
}

/* Utilities */
.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-md);
  background-color: transparent;
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color var(--transition-base);
}

.btn-icon:hover {
  background-color: var(--bg-tertiary);
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xl);
}

/* Mobile responsive */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    z-index: 100;
    height: 100vh;
  }

  .task-panel {
    display: none;
  }

  .summary-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
