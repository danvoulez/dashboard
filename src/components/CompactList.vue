<template>
  <div class="compact-list">
    <div class="list-header">
      <div class="list-title">
        <span class="title-icon">{{ icon }}</span>
        <span>{{ title }}</span>
        <span v-if="items.length" class="item-count">{{ items.length }}</span>
      </div>
      <slot name="header-actions">
        <button class="list-action" @click="$emit('add')">+ Add</button>
      </slot>
    </div>
    <div class="list-body">
      <div
        v-for="(item, index) in items"
        :key="index"
        class="list-item"
        @click="$emit('item-click', item)"
      >
        <div class="item-left">
          <span v-if="item.icon" class="item-icon">{{ item.icon }}</span>
          <div class="item-info">
            <div class="item-title">{{ item.title }}</div>
            <div v-if="item.subtitle" class="item-subtitle">{{ item.subtitle }}</div>
          </div>
        </div>
        <div class="item-right">
          <span v-if="item.badge" class="item-badge" :class="`badge-${item.badgeType || 'default'}`">
            {{ item.badge }}
          </span>
          <span v-if="item.value" class="item-value">{{ item.value }}</span>
          <button v-if="!hideActions" class="item-action" @click.stop="$emit('item-action', item)">
            →
          </button>
        </div>
      </div>
      <div v-if="items.length === 0" class="empty-state">
        {{ emptyText || 'No items' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface ListItem {
  icon?: string
  title: string
  subtitle?: string
  badge?: string
  badgeType?: 'default' | 'success' | 'warning' | 'error' | 'info'
  value?: string | number
}

defineProps<{
  title: string
  icon: string
  items: ListItem[]
  emptyText?: string
  hideActions?: boolean
}>()

defineEmits<{
  'item-click': [item: ListItem]
  'item-action': [item: ListItem]
  'add': []
}>()
</script>

<style scoped>
.compact-list {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.list-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.title-icon {
  font-size: 16px;
}

.item-count {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.list-action {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--accent-primary);
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.list-action:hover {
  background: var(--accent-bg);
  border-color: var(--accent-primary);
}

.list-body {
  max-height: 400px;
  overflow-y: auto;
}

.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid var(--border-color);
}

.list-item:last-child {
  border-bottom: none;
}

.list-item:hover {
  background: var(--bg-hover);
}

.item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.item-icon {
  width: 32px;
  height: 32px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-badge {
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-default {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.badge-success {
  background: var(--success-bg);
  color: var(--success);
}

.badge-warning {
  background: var(--warning-bg);
  color: var(--warning);
}

.badge-error {
  background: var(--error-bg);
  color: var(--error);
}

.badge-info {
  background: var(--info-bg);
  color: var(--info);
}

.item-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.item-action {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.item-action:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.empty-state {
  padding: 40px 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.list-body::-webkit-scrollbar {
  width: 6px;
}

.list-body::-webkit-scrollbar-track {
  background: transparent;
}

.list-body::-webkit-scrollbar-thumb {
  background: var(--bg-tertiary);
  border-radius: 3px;
}
</style>
