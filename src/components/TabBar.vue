<template>
  <div class="tab-bar">
    <div class="tabs-container">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: activeTab === tab.id }"
        @click="selectTab(tab.id)"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
        <button
          v-if="tab.closable"
          class="tab-close"
          @click.stop="closeTab(tab.id)"
        >
          ×
        </button>
      </button>
      <button class="tab-add" @click="$emit('add-tab')">
        +
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits } from 'vue'

export interface Tab {
  id: string
  label: string
  icon: string
  closable?: boolean
}

defineProps<{
  tabs: Tab[]
  activeTab: string
}>()

const emit = defineEmits<{
  'update:activeTab': [id: string]
  'close-tab': [id: string]
  'add-tab': []
}>()

const selectTab = (id: string) => {
  emit('update:activeTab', id)
}

const closeTab = (id: string) => {
  emit('close-tab', id)
}
</script>

<style scoped>
.tab-bar {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  height: 44px;
  display: flex;
  align-items: center;
}

.tabs-container {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 2px;
  padding: 0 8px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  height: 100%;
  white-space: nowrap;
  position: relative;
}

.tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
  background: var(--accent-bg);
}

.tab-icon {
  font-size: 14px;
}

.tab-label {
  font-size: 13px;
}

.tab-close {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
  margin-left: 4px;
  border-radius: 3px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-close:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.tab-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
  border-radius: 4px;
  transition: all 0.2s;
  margin-left: 4px;
}

.tab-add:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
