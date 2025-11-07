<template>
  <div class="task-list">
    <div class="task-list-header">
      <h2>{{ title }}</h2>
      <div class="task-stats">
        <span class="stat">{{ pendingCount }} pendentes</span>
        <span class="stat urgent">{{ urgentCount }} urgentes</span>
        <span class="stat">{{ completedCount }} concluídas</span>
      </div>
    </div>

    <div class="task-filters">
      <button
        v-for="filter in filters"
        :key="filter.id"
        :class="['filter-btn', { active: activeFilter === filter.id }]"
        @click="activeFilter = filter.id"
      >
        {{ filter.label }}
      </button>
    </div>

    <div class="task-list-content">
      <div v-if="loading" class="loading">
        Carregando tarefas...
      </div>

      <div v-else-if="filteredTasks.length === 0" class="empty-state">
        <p>Nenhuma tarefa encontrada</p>
      </div>

      <div v-else class="tasks">
        <div
          v-for="task in filteredTasks"
          :key="task.id"
          :class="['task-item', `status-${task.status}`, { urgent: isUrgent(task) }]"
          @click="selectTask(task)"
        >
          <div class="task-checkbox">
            <input
              type="checkbox"
              :checked="task.status === 'done'"
              @click.stop="toggleTask(task)"
            />
          </div>

          <div class="task-content">
            <div class="task-title">{{ task.title }}</div>
            <div v-if="task.description" class="task-description">
              {{ task.description }}
            </div>

            <div class="task-meta">
              <span v-if="task.deadline" :class="['deadline', { overdue: isOverdue(task) }]">
                📅 {{ formatDeadline(task.deadline) }}
              </span>
              <span class="origin">{{ formatOrigin(task.origin) }}</span>
              <span v-if="task.priority > 0" class="priority">
                Prioridade: {{ task.priority }}
              </span>
            </div>

            <div v-if="task.tags.length > 0" class="task-tags">
              <span v-for="tag in task.tags" :key="tag" class="tag">
                {{ tag }}
              </span>
            </div>
          </div>

          <div class="task-actions">
            <button @click.stop="editTask(task)" class="action-btn" title="Editar">
              ✏️
            </button>
            <button @click.stop="deleteTask(task)" class="action-btn delete" title="Deletar">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="task-list-footer">
      <button @click="createNewTask" class="btn-create">
        + Nova Tarefa
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { storeToRefs } from 'pinia'
import type { Task } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const props = defineProps<{
  title?: string
  mode?: 'all' | 'pending' | 'urgent' | 'completed'
}>()

const emit = defineEmits<{
  taskSelected: [task: Task]
  taskCreated: []
  taskUpdated: [task: Task]
  taskDeleted: [task: Task]
}>()

const taskStore = useTaskStore()
const { tasks, loading, urgentTasks, overdueTasks, sortedTasks } = storeToRefs(taskStore)

const activeFilter = ref<string>(props.mode || 'all')
const selectedTask = ref<Task | null>(null)

const filters = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'urgent', label: 'Urgentes' },
  { id: 'in_progress', label: 'Em Progresso' },
  { id: 'completed', label: 'Concluídas' }
]

const filteredTasks = computed(() => {
  let filtered = sortedTasks.value

  switch (activeFilter.value) {
    case 'pending':
      filtered = filtered.filter(t => t.status === 'pending')
      break
    case 'in_progress':
      filtered = filtered.filter(t => t.status === 'in_progress')
      break
    case 'completed':
      filtered = filtered.filter(t => t.status === 'done')
      break
    case 'urgent':
      filtered = urgentTasks.value
      break
  }

  return filtered
})

const pendingCount = computed(() =>
  tasks.value.filter(t => t.status === 'pending').length
)

const urgentCount = computed(() => urgentTasks.value.length)

const completedCount = computed(() =>
  tasks.value.filter(t => t.status === 'done').length
)

function isUrgent(task: Task): boolean {
  return urgentTasks.value.some(t => t.id === task.id)
}

function isOverdue(task: Task): boolean {
  return overdueTasks.value.some(t => t.id === task.id)
}

function formatDeadline(deadline: string): string {
  try {
    return formatDistanceToNow(new Date(deadline), {
      addSuffix: true,
      locale: ptBR
    })
  } catch {
    return deadline
  }
}

function formatOrigin(origin: string): string {
  const origins: Record<string, string> = {
    manual: '✍️ Manual',
    upload: '📤 Upload',
    webhook: '🔗 Webhook',
    llm: '🤖 IA',
    span: '⚡ Automático',
    plugin: '🔌 Plugin',
    cron: '⏰ Agendado',
    gdrive: '📁 Drive'
  }
  return origins[origin] || origin
}

async function toggleTask(task: Task) {
  const newStatus = task.status === 'done' ? 'pending' : 'done'
  await taskStore.updateTaskStatus(task.id, newStatus)
  emit('taskUpdated', task)
}

function selectTask(task: Task) {
  selectedTask.value = task
  emit('taskSelected', task)
}

function editTask(task: Task) {
  // Emit event for parent to handle editing
  emit('taskSelected', task)
}

async function deleteTask(task: Task) {
  if (confirm(`Deletar tarefa "${task.title}"?`)) {
    await taskStore.deleteTask(task.id)
    emit('taskDeleted', task)
  }
}

function createNewTask() {
  emit('taskCreated')
}

onMounted(async () => {
  if (tasks.value.length === 0) {
    await taskStore.loadTasks()
  }
})
</script>

<style scoped>
.task-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  overflow: hidden;
}

.task-list-header {
  padding: 1rem 1.5rem;
  background: var(--bg-primary, white);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.task-list-header h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  color: var(--text-primary, #333);
}

.task-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
}

.stat {
  color: var(--text-secondary, #666);
}

.stat.urgent {
  color: var(--color-danger, #dc3545);
  font-weight: 600;
}

.task-filters {
  display: flex;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  background: var(--bg-primary, white);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  overflow-x: auto;
}

.filter-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color, #e0e0e0);
  background: white;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
  white-space: nowrap;
}

.filter-btn:hover {
  background: var(--bg-hover, #f0f0f0);
}

.filter-btn.active {
  background: var(--color-primary, #007bff);
  color: white;
  border-color: var(--color-primary, #007bff);
}

.task-list-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.loading, .empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary, #666);
}

.tasks {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.task-item {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: white;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.task-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.task-item.urgent {
  border-left: 4px solid var(--color-danger, #dc3545);
}

.task-item.status-done {
  opacity: 0.6;
}

.task-item.status-done .task-title {
  text-decoration: line-through;
}

.task-checkbox input {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.task-content {
  flex: 1;
}

.task-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: var(--text-primary, #333);
}

.task-description {
  font-size: 0.875rem;
  color: var(--text-secondary, #666);
  margin-bottom: 0.5rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #666);
  margin-bottom: 0.5rem;
}

.deadline.overdue {
  color: var(--color-danger, #dc3545);
  font-weight: 600;
}

.task-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.tag {
  padding: 0.125rem 0.5rem;
  background: var(--bg-tag, #e9ecef);
  border-radius: 12px;
  font-size: 0.75rem;
  color: var(--text-secondary, #666);
}

.task-actions {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  padding: 0.25rem;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.action-btn:hover {
  opacity: 1;
}

.task-list-footer {
  padding: 1rem 1.5rem;
  background: var(--bg-primary, white);
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.btn-create {
  width: 100%;
  padding: 0.75rem;
  background: var(--color-primary, #007bff);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-create:hover {
  background: var(--color-primary-dark, #0056b3);
}
</style>
