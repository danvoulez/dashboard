<template>
  <div class="modern-dashboard">
    <!-- Modern Sidebar -->
    <ModernSidebar />

    <!-- Main Content Area -->
    <div class="dashboard-main">
      <!-- Tab Bar -->
      <TabBar
        :tabs="tabs"
        :active-tab="activeTab"
        @update:active-tab="activeTab = $event"
        @close-tab="closeTab"
        @add-tab="showTabSelector = true"
      />

      <!-- Dashboard Content -->
      <div class="dashboard-content">
        <!-- Overview Tab -->
        <div v-if="activeTab === 'overview'" class="tab-content">
          <!-- Metrics Row -->
          <div class="metrics-grid">
            <MetricCard
              icon="✅"
              label="Tasks Completed"
              :value="taskStore.completedTasks.length"
              :change="12"
              period="vs yesterday"
              badge="Today"
              badge-type="success"
            />
            <MetricCard
              icon="⚡"
              label="In Progress"
              :value="taskStore.inProgressTasks.length"
              badge="Active"
              badge-type="info"
              variant="compact"
            />
            <MetricCard
              icon="🎯"
              label="Urgent Tasks"
              :value="taskStore.urgentTasks.length"
              :change="-5"
              badge="High Priority"
              badge-type="error"
            />
            <MetricCard
              icon="📊"
              label="Total Tasks"
              :value="taskStore.tasks.length"
              :change="8"
              period="vs last week"
            />
          </div>

          <!-- Charts Row -->
          <div class="charts-row">
            <LineChart
              title="Task Completion Trend"
              icon="📈"
              :labels="['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']"
              :series-data="[
                { label: 'Completed', data: [5, 8, 6, 10, 12, 7, 9], color: '#10b981' },
                { label: 'Created', data: [7, 6, 9, 8, 10, 11, 8], color: '#3b82f6' }
              ]"
              :width="700"
              :height="300"
            />
            <DonutChart
              title="Tasks by Status"
              icon="📊"
              :data="tasksByStatus"
              :size="250"
            />
          </div>

          <!-- Widgets Row -->
          <div class="widgets-row">
            <ActivityFeed
              title="Recent Activity"
              :items="recentActivity"
              @item-click="handleActivityClick"
            />
            <ProgressWidget
              icon="🎯"
              title="Daily Goal"
              subtitle="Complete 10 tasks today"
              :current="dashboardStore.dailyProgress.tasksCompleted"
              :total="10"
              color="#10b981"
              remaining="2 hours left"
            />
          </div>

          <!-- Stats and Lists Row -->
          <div class="stats-lists-row">
            <QuickStats
              title="Quick Stats"
              :stats="quickStats"
            />
            <CompactList
              title="Urgent Tasks"
              icon="🔥"
              :items="urgentTasksList"
              @item-click="handleTaskClick"
              @item-action="handleTaskAction"
            />
          </div>
        </div>

        <!-- Analytics Tab -->
        <div v-if="activeTab === 'analytics'" class="tab-content">
          <div class="analytics-header">
            <h2>📊 Analytics Dashboard</h2>
            <div class="analytics-filters">
              <select class="filter-select">
                <option>Last 7 days</option>
                <option>Last 30 days</option>
                <option>Last 90 days</option>
              </select>
            </div>
          </div>

          <div class="metrics-grid">
            <MetricCard
              icon="⏱"
              label="Focus Time"
              :value="formatTime(dashboardStore.focusTime)"
              :change="15"
              variant="compact"
            />
            <MetricCard
              icon="📅"
              label="Avg. Tasks/Day"
              :value="8.5"
              :change="10"
              variant="compact"
            />
            <MetricCard
              icon="✨"
              label="Completion Rate"
              value="87%"
              :change="5"
              badge-type="success"
              variant="compact"
            />
            <MetricCard
              icon="🔥"
              label="Current Streak"
              :value="7"
              badge="Days"
              badge-type="warning"
              variant="compact"
            />
          </div>

          <div class="full-width-chart">
            <LineChart
              title="Productivity Over Time"
              icon="📈"
              :labels="['Week 1', 'Week 2', 'Week 3', 'Week 4']"
              :series-data="[
                { label: 'Tasks Completed', data: [45, 52, 48, 61], color: '#10b981' },
                { label: 'Focus Hours', data: [32, 38, 35, 42], color: '#3b82f6' },
                { label: 'Goals Met', data: [5, 6, 5, 7], color: '#f59e0b' }
              ]"
              :width="1200"
              :height="350"
            />
          </div>
        </div>

        <!-- Data Table Tab -->
        <div v-if="activeTab === 'tasks'" class="tab-content">
          <DataTable
            title="All Tasks"
            icon="📋"
            :columns="taskColumns"
            :data="taskStore.tasks"
            :actions="true"
            @row-click="handleTaskClick"
            @edit="handleEditTask"
            @delete="handleDeleteTask"
            @refresh="refreshTasks"
            @export="exportTasks"
          >
            <template #cell-status="{ value }">
              <span class="status-badge" :class="`status-${value}`">
                {{ value }}
              </span>
            </template>
            <template #cell-priority="{ value }">
              <span class="priority-badge" :class="`priority-${value}`">
                {{ value }}
              </span>
            </template>
          </DataTable>
        </div>

        <!-- Widgets Tab -->
        <div v-if="activeTab === 'widgets'" class="tab-content">
          <div class="widgets-showcase">
            <div class="showcase-section">
              <h3>Progress Widgets</h3>
              <div class="widgets-grid">
                <ProgressWidget
                  icon="📚"
                  title="Learning Progress"
                  subtitle="JavaScript Course"
                  :current="7"
                  :total="12"
                  color="#3b82f6"
                />
                <ProgressWidget
                  icon="💪"
                  title="Fitness Goals"
                  subtitle="Weekly workout target"
                  :current="4"
                  :total="5"
                  color="#10b981"
                />
              </div>
            </div>

            <div class="showcase-section">
              <h3>Activity Feeds</h3>
              <ActivityFeed
                title="System Notifications"
                :items="systemActivity"
              />
            </div>

            <div class="showcase-section">
              <h3>Quick Stats Grid</h3>
              <QuickStats
                title="Performance Metrics"
                :stats="performanceStats"
              />
            </div>

            <div class="showcase-section">
              <h3>Compact Lists</h3>
              <div class="lists-grid">
                <CompactList
                  title="Recent Files"
                  icon="📄"
                  :items="recentFiles"
                />
                <CompactList
                  title="Notifications"
                  icon="🔔"
                  :items="notifications"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Task Panel (Right Side) -->
    <TaskPanel />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { useTaskStore } from '@/stores/tasks'
import ModernSidebar from '@/components/ModernSidebar.vue'
import TabBar, { type Tab } from '@/components/TabBar.vue'
import MetricCard from '@/components/MetricCard.vue'
import DataTable, { type TableColumn } from '@/components/DataTable.vue'
import LineChart from '@/components/LineChart.vue'
import DonutChart from '@/components/DonutChart.vue'
import ActivityFeed, { type ActivityItem } from '@/components/ActivityFeed.vue'
import ProgressWidget from '@/components/ProgressWidget.vue'
import QuickStats, { type Stat } from '@/components/QuickStats.vue'
import CompactList, { type ListItem } from '@/components/CompactList.vue'
import TaskPanel from '@/components/TaskPanel.vue'

const dashboardStore = useDashboardStore()
const taskStore = useTaskStore()

const showTabSelector = ref(false)
const activeTab = ref('overview')

const tabs = ref<Tab[]>([
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
  { id: 'tasks', label: 'Tasks', icon: '📋' },
  { id: 'widgets', label: 'Widgets', icon: '🧩', closable: true }
])

const closeTab = (tabId: string) => {
  tabs.value = tabs.value.filter(t => t.id !== tabId)
  if (activeTab.value === tabId) {
    activeTab.value = tabs.value[0]?.id || 'overview'
  }
}

// Task columns for DataTable
const taskColumns: TableColumn[] = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'deadline', label: 'Deadline', format: (val) => val ? new Date(val).toLocaleDateString() : '-' }
]

// Tasks by status for DonutChart
const tasksByStatus = computed(() => [
  { label: 'Completed', value: taskStore.completedTasks.length, color: '#10b981' },
  { label: 'In Progress', value: taskStore.inProgressTasks.length, color: '#3b82f6' },
  { label: 'Pending', value: taskStore.pendingTasks.length, color: '#f59e0b' },
  { label: 'Urgent', value: taskStore.urgentTasks.length, color: '#ef4444' }
])

// Recent activity for ActivityFeed
const recentActivity = computed<ActivityItem[]>(() => [
  {
    icon: '✅',
    title: 'Task Completed',
    description: 'Finished "Update documentation"',
    time: '2 minutes ago',
    color: '#10b981'
  },
  {
    icon: '📝',
    title: 'Task Created',
    description: 'New task "Review pull request"',
    time: '15 minutes ago',
    color: '#3b82f6'
  },
  {
    icon: '⚡',
    title: 'Focus Session Started',
    description: 'Working on "Fix bug #123"',
    time: '1 hour ago',
    color: '#f59e0b'
  },
  {
    icon: '🔔',
    title: 'Reminder',
    description: 'Team meeting in 30 minutes',
    time: '2 hours ago',
    color: '#8b5cf6'
  }
])

// Quick stats
const quickStats: Stat[] = [
  { icon: '🎯', value: '95%', label: 'On Track', color: '#10b981' },
  { icon: '⚡', value: '24', label: 'This Week', color: '#3b82f6' },
  { icon: '🔥', value: '7', label: 'Streak', color: '#f59e0b' },
  { icon: '⭐', value: 'A+', label: 'Grade', color: '#8b5cf6' }
]

// Urgent tasks list
const urgentTasksList = computed<ListItem[]>(() =>
  taskStore.urgentTasks.slice(0, 5).map(task => ({
    icon: '🔥',
    title: task.title,
    subtitle: task.deadline ? `Due ${new Date(task.deadline).toLocaleDateString()}` : undefined,
    badge: String(task.priority),
    badgeType: String(task.priority) === 'urgent' ? 'error' : 'warning',
    value: String(task.status)
  }))
)

// System activity
const systemActivity: ActivityItem[] = [
  { icon: '💾', title: 'Auto-save', description: 'All changes saved', time: 'Just now', color: '#10b981' },
  { icon: '🔄', title: 'Sync completed', description: '5 tasks synchronized', time: '5 min ago', color: '#3b82f6' },
  { icon: '🎉', title: 'Milestone reached', description: '50 tasks completed!', time: '1 hour ago', color: '#f59e0b' }
]

// Performance stats
const performanceStats: Stat[] = [
  { icon: '💼', value: '156', label: 'Total Tasks', color: '#3b82f6' },
  { icon: '✅', value: '142', label: 'Completed', color: '#10b981' },
  { icon: '⏱', value: '48h', label: 'Focus Time', color: '#f59e0b' },
  { icon: '📊', value: '91%', label: 'Success Rate', color: '#8b5cf6' }
]

// Recent files
const recentFiles: ListItem[] = [
  { icon: '📄', title: 'project-plan.pdf', subtitle: 'Modified today', value: '2.4 MB' },
  { icon: '📊', title: 'analytics.xlsx', subtitle: 'Modified yesterday', value: '1.8 MB' },
  { icon: '🖼', title: 'design-mockup.fig', subtitle: '2 days ago', value: '5.2 MB' }
]

// Notifications
const notifications: ListItem[] = [
  { icon: '💬', title: 'New comment', subtitle: 'John replied to your task', badge: 'New', badgeType: 'info' },
  { icon: '👥', title: 'Team invite', subtitle: 'Join "Marketing Team"', badge: 'Action', badgeType: 'warning' },
  { icon: '⚠️', title: 'Deadline approaching', subtitle: 'Task due in 2 hours', badge: 'Urgent', badgeType: 'error' }
]

// Helper functions
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function handleActivityClick(item: ActivityItem) {
  console.log('Activity clicked:', item)
}

function handleTaskClick(task: any) {
  console.log('Task clicked:', task)
}

function handleTaskAction(task: any) {
  console.log('Task action:', task)
}

function handleEditTask(task: any) {
  console.log('Edit task:', task)
}

function handleDeleteTask(task: any) {
  console.log('Delete task:', task)
}

function refreshTasks() {
  // Refresh tasks from the store
  console.log('Refreshing tasks...')
}

function exportTasks() {
  console.log('Export tasks')
}
</script>

<style scoped>
.modern-dashboard {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
  margin-left: 240px; /* Space for sidebar */
}

.dashboard-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-right: 360px; /* Space for TaskPanel */
  overflow: hidden;
}

.dashboard-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-secondary);
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1600px;
  margin: 0 auto;
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

/* Charts Row */
.charts-row {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
}

/* Widgets Row */
.widgets-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* Stats and Lists Row */
.stats-lists-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* Analytics */
.analytics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.analytics-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.analytics-filters {
  display: flex;
  gap: 12px;
}

.filter-select {
  padding: 8px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.full-width-chart {
  width: 100%;
}

/* Widgets Showcase */
.widgets-showcase {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.showcase-section h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.widgets-grid,
.lists-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 16px;
}

/* Status and Priority Badges */
.status-badge,
.priority-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-pending {
  background: var(--warning-bg);
  color: var(--warning);
}

.status-in_progress {
  background: var(--info-bg);
  color: var(--info);
}

.status-completed {
  background: var(--success-bg);
  color: var(--success);
}

.priority-urgent {
  background: var(--error-bg);
  color: var(--error);
}

.priority-high {
  background: var(--warning-bg);
  color: var(--warning);
}

.priority-medium {
  background: var(--info-bg);
  color: var(--info);
}

.priority-low {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

/* Scrollbar */
.dashboard-content::-webkit-scrollbar {
  width: 8px;
}

.dashboard-content::-webkit-scrollbar-track {
  background: var(--bg-primary);
}

.dashboard-content::-webkit-scrollbar-thumb {
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.dashboard-content::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

/* Responsive */
@media (max-width: 1400px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1024px) {
  .widgets-row,
  .stats-lists-row {
    grid-template-columns: 1fr;
  }

  .modern-dashboard {
    margin-left: 64px; /* Collapsed sidebar */
  }
}

@media (max-width: 768px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .dashboard-main {
    margin-right: 0; /* Hide TaskPanel on mobile */
  }
}
</style>
