<template>
  <div class="data-table-container">
    <div class="table-header">
      <div class="table-title">
        <span class="title-icon">{{ icon }}</span>
        <span class="title-text">{{ title }}</span>
        <span v-if="data.length > 0" class="title-count">{{ data.length }}</span>
      </div>
      <div class="table-actions">
        <input
          v-model="searchQuery"
          type="text"
          class="table-search"
          placeholder="Search..."
        />
        <button class="table-action-btn" @click="$emit('refresh')">
          🔄
        </button>
        <button class="table-action-btn" @click="$emit('export')">
          ⬇
        </button>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              :class="{ sortable: column.sortable !== false }"
              @click="column.sortable !== false && sortBy(column.key)"
            >
              <div class="th-content">
                <span>{{ column.label }}</span>
                <span v-if="column.sortable !== false" class="sort-icon">
                  {{ getSortIcon(column.key) }}
                </span>
              </div>
            </th>
            <th v-if="actions" class="actions-column">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in filteredData" :key="index" @click="$emit('row-click', row)">
            <td v-for="column in columns" :key="column.key">
              <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
                {{ formatCell(row[column.key], column) }}
              </slot>
            </td>
            <td v-if="actions" class="actions-cell">
              <slot name="actions" :row="row">
                <button class="action-btn" @click.stop="$emit('edit', row)">✏️</button>
                <button class="action-btn" @click.stop="$emit('delete', row)">🗑️</button>
              </slot>
            </td>
          </tr>
          <tr v-if="filteredData.length === 0">
            <td :colspan="columns.length + (actions ? 1 : 0)" class="empty-state">
              {{ searchQuery ? 'No results found' : 'No data available' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

export interface TableColumn {
  key: string
  label: string
  sortable?: boolean
  format?: (value: any) => string
}

const props = defineProps<{
  title: string
  icon?: string
  columns: TableColumn[]
  data: any[]
  actions?: boolean
}>()

defineEmits<{
  'row-click': [row: any]
  'edit': [row: any]
  'delete': [row: any]
  'refresh': []
  'export': []
}>()

const searchQuery = ref('')
const sortColumn = ref<string>('')
const sortDirection = ref<'asc' | 'desc'>('asc')

const filteredData = computed(() => {
  let result = [...props.data]

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(row =>
      Object.values(row).some(value =>
        String(value).toLowerCase().includes(query)
      )
    )
  }

  // Sorting
  if (sortColumn.value) {
    result.sort((a, b) => {
      const aVal = a[sortColumn.value]
      const bVal = b[sortColumn.value]

      if (aVal === bVal) return 0
      const comparison = aVal > bVal ? 1 : -1
      return sortDirection.value === 'asc' ? comparison : -comparison
    })
  }

  return result
})

const sortBy = (key: string) => {
  if (sortColumn.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = key
    sortDirection.value = 'asc'
  }
}

const getSortIcon = (key: string) => {
  if (sortColumn.value !== key) return '⇅'
  return sortDirection.value === 'asc' ? '↑' : '↓'
}

const formatCell = (value: any, column: TableColumn) => {
  if (column.format) return column.format(value)
  if (value === null || value === undefined) return '-'
  return String(value)
}
</script>

<style scoped>
.data-table-container {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.table-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.title-icon {
  font-size: 16px;
}

.title-count {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-search {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  width: 200px;
}

.table-search:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.table-action-btn {
  padding: 6px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.table-action-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table thead {
  background: var(--bg-secondary);
  position: sticky;
  top: 0;
  z-index: 10;
}

.data-table th {
  padding: 10px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.data-table th.sortable:hover {
  background: var(--bg-hover);
}

.th-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sort-icon {
  color: var(--text-tertiary);
  font-size: 12px;
}

.data-table tbody tr {
  transition: background 0.2s;
  cursor: pointer;
}

.data-table tbody tr:hover {
  background: var(--bg-hover);
}

.data-table tbody tr:not(:last-child) {
  border-bottom: 1px solid var(--border-color);
}

.data-table td {
  padding: 12px 16px;
  color: var(--text-primary);
}

.actions-column,
.actions-cell {
  width: 100px;
  text-align: center;
}

.actions-cell {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.action-btn {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
}

.empty-state {
  text-align: center;
  padding: 40px 16px !important;
  color: var(--text-tertiary);
  font-style: italic;
}
</style>
