<template>
  <div class="chart-container">
    <div class="chart-header">
      <div class="chart-title">
        <span class="title-icon">{{ icon }}</span>
        <span>{{ title }}</span>
      </div>
    </div>
    <div class="chart-body">
      <svg :width="size" :height="size" class="donut-chart">
        <g :transform="`translate(${size / 2}, ${size / 2})`">
          <!-- Donut segments -->
          <path
            v-for="(segment, index) in segments"
            :key="index"
            :d="segment.path"
            :fill="segment.color"
            :class="{ active: hoveredIndex === index }"
            @mouseenter="hoveredIndex = index"
            @mouseleave="hoveredIndex = null"
            class="segment"
          />
          <!-- Center text -->
          <text text-anchor="middle" dy="0.35em" class="center-text">
            {{ total }}
          </text>
          <text text-anchor="middle" dy="1.5em" class="center-label">
            Total
          </text>
        </g>
      </svg>
      <div class="chart-legend">
        <div
          v-for="(item, index) in data"
          :key="index"
          class="legend-item"
          @mouseenter="hoveredIndex = index"
          @mouseleave="hoveredIndex = null"
        >
          <span class="legend-color" :style="{ background: item.color }"></span>
          <span class="legend-label">{{ item.label }}</span>
          <span class="legend-value">{{ item.value }}</span>
          <span class="legend-percent">{{ getPercent(item.value) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface DonutData {
  label: string
  value: number
  color: string
}

const props = withDefaults(
  defineProps<{
    title: string
    icon?: string
    data: DonutData[]
    size?: number
  }>(),
  {
    icon: '📊',
    size: 200
  }
)

const hoveredIndex = ref<number | null>(null)

const total = computed(() => props.data.reduce((sum, item) => sum + item.value, 0))

const getPercent = (value: number) => {
  return ((value / total.value) * 100).toFixed(1)
}

const segments = computed(() => {
  let currentAngle = -90 // Start at top
  const radius = props.size / 2 - 10
  const innerRadius = radius * 0.6

  return props.data.map(item => {
    const percent = item.value / total.value
    const angle = percent * 360
    const endAngle = currentAngle + angle

    const x1 = radius * Math.cos((currentAngle * Math.PI) / 180)
    const y1 = radius * Math.sin((currentAngle * Math.PI) / 180)
    const x2 = radius * Math.cos((endAngle * Math.PI) / 180)
    const y2 = radius * Math.sin((endAngle * Math.PI) / 180)

    const ix1 = innerRadius * Math.cos((currentAngle * Math.PI) / 180)
    const iy1 = innerRadius * Math.sin((currentAngle * Math.PI) / 180)
    const ix2 = innerRadius * Math.cos((endAngle * Math.PI) / 180)
    const iy2 = innerRadius * Math.sin((endAngle * Math.PI) / 180)

    const largeArc = angle > 180 ? 1 : 0

    const path = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}`,
      'Z'
    ].join(' ')

    currentAngle = endAngle

    return {
      path,
      color: item.color
    }
  })
})
</script>

<style scoped>
.chart-container {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.chart-header {
  margin-bottom: 16px;
}

.chart-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.title-icon {
  font-size: 16px;
}

.chart-body {
  display: flex;
  gap: 24px;
  align-items: center;
}

.donut-chart {
  flex-shrink: 0;
}

.segment {
  cursor: pointer;
  transition: opacity 0.2s, transform 0.2s;
  transform-origin: center;
}

.segment:hover,
.segment.active {
  opacity: 0.8;
}

.center-text {
  font-size: 32px;
  font-weight: 700;
  fill: var(--text-primary);
}

.center-label {
  font-size: 12px;
  fill: var(--text-tertiary);
}

.chart-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.legend-item:hover {
  background: var(--bg-hover);
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.legend-label {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
}

.legend-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.legend-percent {
  font-size: 12px;
  color: var(--text-tertiary);
  min-width: 40px;
  text-align: right;
}
</style>
