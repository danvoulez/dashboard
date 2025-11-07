<template>
  <div class="activity-feed">
    <div class="feed-header">
      <div class="feed-title">
        <span class="title-icon">📋</span>
        <span>{{ title }}</span>
      </div>
      <button class="feed-action" @click="$emit('view-all')">View all</button>
    </div>
    <div class="feed-items">
      <div
        v-for="(item, index) in items"
        :key="index"
        class="feed-item"
        @click="$emit('item-click', item)"
      >
        <div class="item-icon" :style="{ background: item.color || 'var(--accent-primary)' }">
          {{ item.icon }}
        </div>
        <div class="item-content">
          <div class="item-title">{{ item.title }}</div>
          <div class="item-description">{{ item.description }}</div>
          <div class="item-time">{{ item.time }}</div>
        </div>
      </div>
      <div v-if="items.length === 0" class="empty-state">
        No recent activity
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface ActivityItem {
  icon: string
  title: string
  description: string
  time: string
  color?: string
}

defineProps<{
  title: string
  items: ActivityItem[]
}>()

defineEmits<{
  'view-all': []
  'item-click': [item: ActivityItem]
}>()
</script>

<style scoped>
.activity-feed {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.feed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.feed-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.title-icon {
  font-size: 16px;
}

.feed-action {
  background: transparent;
  border: none;
  color: var(--accent-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.feed-action:hover {
  background: var(--accent-bg);
}

.feed-items {
  max-height: 400px;
  overflow-y: auto;
}

.feed-item {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid var(--border-color);
}

.feed-item:last-child {
  border-bottom: none;
}

.feed-item:hover {
  background: var(--bg-hover);
}

.item-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  color: white;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.item-description {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-time {
  font-size: 11px;
  color: var(--text-tertiary);
}

.empty-state {
  padding: 40px 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.feed-items::-webkit-scrollbar {
  width: 6px;
}

.feed-items::-webkit-scrollbar-track {
  background: transparent;
}

.feed-items::-webkit-scrollbar-thumb {
  background: var(--bg-tertiary);
  border-radius: 3px;
}
</style>
