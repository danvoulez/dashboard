<template>
  <div class="quick-stats">
    <div class="stats-header">
      <span class="stats-icon">⚡</span>
      <span class="stats-title">{{ title }}</span>
    </div>
    <div class="stats-grid">
      <div
        v-for="(stat, index) in stats"
        :key="index"
        class="stat-item"
        @click="$emit('stat-click', stat)"
      >
        <div class="stat-icon" :style="{ background: stat.color }">
          {{ stat.icon }}
        </div>
        <div class="stat-value">{{ stat.value }}</div>
        <div class="stat-label">{{ stat.label }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface Stat {
  icon: string
  value: string | number
  label: string
  color: string
}

defineProps<{
  title: string
  stats: Stat[]
}>()

defineEmits<{
  'stat-click': [stat: Stat]
}>()
</script>

<style scoped>
.quick-stats {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.stats-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.stats-icon {
  font-size: 18px;
}

.stats-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.stat-item:hover {
  border-color: var(--accent-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
