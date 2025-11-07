<template>
  <div class="metric-card" :class="variant">
    <div class="metric-header">
      <span class="metric-icon">{{ icon }}</span>
      <span v-if="badge" class="metric-badge" :class="`badge-${badgeType}`">{{ badge }}</span>
    </div>
    <div class="metric-content">
      <div class="metric-value">{{ value }}</div>
      <div class="metric-label">{{ label }}</div>
    </div>
    <div v-if="change !== undefined" class="metric-footer">
      <span class="metric-change" :class="changeClass">
        <span class="change-icon">{{ changeIcon }}</span>
        <span class="change-value">{{ Math.abs(change) }}%</span>
      </span>
      <span class="metric-period">{{ period || 'vs last period' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  icon: string
  label: string
  value: string | number
  change?: number
  period?: string
  badge?: string
  badgeType?: 'success' | 'warning' | 'error' | 'info'
  variant?: 'default' | 'compact' | 'outline'
}>()

const changeClass = computed(() => {
  if (props.change === undefined) return ''
  return props.change >= 0 ? 'positive' : 'negative'
})

const changeIcon = computed(() => {
  if (props.change === undefined) return ''
  return props.change >= 0 ? '↑' : '↓'
})
</script>

<style scoped>
.metric-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.metric-card:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.metric-card.compact {
  padding: 12px;
}

.metric-card.outline {
  background: transparent;
  border: 2px solid var(--border-color);
}

.metric-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.metric-icon {
  width: 36px;
  height: 36px;
  background: var(--accent-bg);
  color: var(--accent-primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.metric-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
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

.metric-content {
  margin-bottom: 8px;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  margin-bottom: 4px;
}

.metric-card.compact .metric-value {
  font-size: 24px;
}

.metric-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.metric-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  margin-top: 8px;
}

.metric-change {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
}

.metric-change.positive {
  color: var(--success);
}

.metric-change.negative {
  color: var(--error);
}

.change-icon {
  font-size: 14px;
}

.metric-period {
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
