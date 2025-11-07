<template>
  <div class="progress-widget">
    <div class="widget-header">
      <div class="widget-info">
        <span class="widget-icon">{{ icon }}</span>
        <div class="widget-text">
          <div class="widget-title">{{ title }}</div>
          <div class="widget-subtitle">{{ subtitle }}</div>
        </div>
      </div>
      <div class="widget-value">
        {{ current }}<span class="value-total">/{{ total }}</span>
      </div>
    </div>
    <div class="progress-bar">
      <div
        class="progress-fill"
        :style="{ width: `${percentage}%`, background: color }"
      ></div>
    </div>
    <div class="widget-footer">
      <span class="percentage">{{ percentage }}% complete</span>
      <span v-if="remaining" class="remaining">{{ remaining }} remaining</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    icon: string
    title: string
    subtitle?: string
    current: number
    total: number
    color?: string
    remaining?: string
  }>(),
  {
    color: 'var(--accent-primary)'
  }
)

const percentage = computed(() => {
  return Math.round((props.current / props.total) * 100)
})
</script>

<style scoped>
.progress-widget {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.widget-info {
  display: flex;
  gap: 12px;
  align-items: center;
}

.widget-icon {
  width: 40px;
  height: 40px;
  background: var(--accent-bg);
  color: var(--accent-primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.widget-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.widget-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.widget-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
}

.widget-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.value-total {
  font-size: 16px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.progress-bar {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.widget-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.percentage {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.remaining {
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
