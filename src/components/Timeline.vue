<template>
  <div class="timeline">
    <div class="timeline-header">
      <h2>{{ title }}</h2>
      <div class="timeline-controls">
        <select v-model="filterType" class="filter-select">
          <option value="all">Todos os eventos</option>
          <option value="task">Tarefas</option>
          <option value="span">Execuções</option>
          <option value="upload">Uploads</option>
          <option value="focus">Foco</option>
          <option value="policy">Políticas</option>
        </select>
      </div>
    </div>

    <div class="timeline-content">
      <div v-if="loading" class="loading">
        Carregando timeline...
      </div>

      <div v-else-if="groupedEntries.length === 0" class="empty-state">
        <p>Nenhum evento registrado</p>
      </div>

      <div v-else class="timeline-groups">
        <div
          v-for="group in groupedEntries"
          :key="group.date"
          class="timeline-group"
        >
          <div class="timeline-date">
            <span class="date-label">{{ group.label }}</span>
            <span class="date-count">{{ group.entries.length }} eventos</span>
          </div>

          <div class="timeline-entries">
            <div
              v-for="entry in group.entries"
              :key="entry.id"
              :class="['timeline-entry', `type-${entry.type}`]"
              @click="selectEntry(entry)"
            >
              <div class="entry-icon">{{ getEntryIcon(entry.type) }}</div>

              <div class="entry-content">
                <div class="entry-header">
                  <span class="entry-title">{{ entry.title }}</span>
                  <span class="entry-time">{{ formatTime(entry.timestamp) }}</span>
                </div>

                <div v-if="entry.description" class="entry-description">
                  {{ entry.description }}
                </div>

                <div v-if="entry.metadata" class="entry-metadata">
                  <span
                    v-for="(value, key) in visibleMetadata(entry.metadata)"
                    :key="key"
                    class="metadata-item"
                  >
                    {{ key }}: {{ value }}
                  </span>
                </div>
              </div>

              <div class="entry-actions">
                <button
                  v-if="entry.spanId"
                  @click.stop="viewSpan(entry.spanId)"
                  class="action-btn"
                  title="Ver span"
                >
                  🔍
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { TimelineEntry } from '@/types'
import { getTimelineEntries } from '@/utils/db'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const props = defineProps<{
  title?: string
  limit?: number
}>()

const emit = defineEmits<{
  entrySelected: [entry: TimelineEntry]
  spanViewed: [spanId: string]
}>()

const entries = ref<TimelineEntry[]>([])
const loading = ref(false)
const filterType = ref<string>('all')

const filteredEntries = computed(() => {
  if (filterType.value === 'all') {
    return entries.value
  }
  return entries.value.filter(e => e.type === filterType.value)
})

interface TimelineGroup {
  date: string
  label: string
  entries: TimelineEntry[]
}

const groupedEntries = computed<TimelineGroup[]>(() => {
  const groups = new Map<string, TimelineEntry[]>()

  for (const entry of filteredEntries.value) {
    const date = new Date(entry.timestamp)
    const dateKey = format(date, 'yyyy-MM-dd')

    if (!groups.has(dateKey)) {
      groups.set(dateKey, [])
    }
    groups.get(dateKey)!.push(entry)
  }

  const result: TimelineGroup[] = []
  for (const [dateKey, entries] of groups.entries()) {
    const date = new Date(dateKey)
    let label = format(date, 'dd MMM yyyy', { locale: ptBR })

    if (isToday(date)) {
      label = 'Hoje'
    } else if (isYesterday(date)) {
      label = 'Ontem'
    }

    result.push({
      date: dateKey,
      label,
      entries: entries.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
    })
  }

  return result.sort((a, b) => b.date.localeCompare(a.date))
})

function getEntryIcon(type: string): string {
  const icons: Record<string, string> = {
    task: '✅',
    span: '⚡',
    upload: '📤',
    focus: '🎯',
    policy: '🤖'
  }
  return icons[type] || '📌'
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    if (isToday(date)) {
      return format(date, 'HH:mm')
    }
    return format(date, 'HH:mm')
  } catch {
    return timestamp
  }
}

function visibleMetadata(metadata: Record<string, any>): Record<string, any> {
  // Show only a few key metadata fields
  const visible: Record<string, any> = {}
  const keys = Object.keys(metadata).slice(0, 3)

  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' || typeof value === 'number') {
      visible[key] = value
    }
  }

  return visible
}

function selectEntry(entry: TimelineEntry) {
  emit('entrySelected', entry)
}

function viewSpan(spanId: string) {
  emit('spanViewed', spanId)
}

async function loadTimeline() {
  loading.value = true
  try {
    entries.value = await getTimelineEntries(props.limit)
  } catch (error) {
    console.error('Failed to load timeline:', error)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadTimeline()
})

// Auto-refresh timeline every minute
setInterval(() => {
  loadTimeline()
}, 60000)
</script>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  overflow: hidden;
}

.timeline-header {
  padding: 1rem 1.5rem;
  background: var(--bg-primary, white);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.timeline-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary, #333);
}

.timeline-controls {
  display: flex;
  gap: 0.5rem;
}

.filter-select {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  background: white;
  font-size: 0.875rem;
  cursor: pointer;
}

.timeline-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.loading, .empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary, #666);
}

.timeline-groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.timeline-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.timeline-date {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 2px solid var(--border-color, #e0e0e0);
}

.date-label {
  font-weight: 700;
  font-size: 1.125rem;
  color: var(--text-primary, #333);
}

.date-count {
  font-size: 0.875rem;
  color: var(--text-secondary, #666);
}

.timeline-entries {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-left: 1rem;
  position: relative;
}

.timeline-entries::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--border-color, #e0e0e0);
}

.timeline-entry {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.timeline-entry::before {
  content: '';
  position: absolute;
  left: -1rem;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary, #007bff);
  border: 2px solid white;
  z-index: 1;
}

.timeline-entry:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateX(2px);
}

.timeline-entry.type-task::before {
  background: var(--color-success, #28a745);
}

.timeline-entry.type-span::before {
  background: var(--color-info, #17a2b8);
}

.timeline-entry.type-upload::before {
  background: var(--color-warning, #ffc107);
}

.timeline-entry.type-policy::before {
  background: var(--color-secondary, #6c757d);
}

.entry-icon {
  font-size: 1.5rem;
  line-height: 1;
}

.entry-content {
  flex: 1;
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.entry-title {
  font-weight: 600;
  color: var(--text-primary, #333);
}

.entry-time {
  font-size: 0.75rem;
  color: var(--text-secondary, #666);
}

.entry-description {
  font-size: 0.875rem;
  color: var(--text-secondary, #666);
  margin-bottom: 0.5rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.entry-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.metadata-item {
  padding: 0.125rem 0.5rem;
  background: var(--bg-tag, #e9ecef);
  border-radius: 12px;
  font-size: 0.75rem;
  color: var(--text-secondary, #666);
}

.entry-actions {
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
</style>
