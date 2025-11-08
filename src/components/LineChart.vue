<template>
  <div class="chart-container">
    <div class="chart-header">
      <div class="chart-title">
        <span class="title-icon">{{ icon }}</span>
        <span>{{ title }}</span>
      </div>
      <div class="chart-legend">
        <span v-for="series in seriesData" :key="series.label" class="legend-item">
          <span class="legend-color" :style="{ background: series.color }"></span>
          <span>{{ series.label }}</span>
        </span>
      </div>
    </div>
    <div class="chart-body">
      <svg :width="width" :height="height" class="line-chart">
        <!-- Grid lines -->
        <line
          v-for="i in 5"
          :key="`grid-${i}`"
          :x1="padding"
          :y1="padding + ((height - padding * 2) / 4) * (i - 1)"
          :x2="width - padding"
          :y2="padding + ((height - padding * 2) / 4) * (i - 1)"
          stroke="var(--border-color)"
          stroke-width="1"
          stroke-dasharray="4"
        />

        <!-- Lines -->
        <g v-for="(series, idx) in seriesData" :key="series.label">
          <polyline
            :points="getLinePoints(series.data)"
            :stroke="series.color"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <!-- Data points -->
          <circle
            v-for="(point, i) in series.data"
            :key="`${idx}-${i}`"
            :cx="getX(i)"
            :cy="getY(point)"
            r="4"
            :fill="series.color"
            class="data-point"
          />
        </g>

        <!-- X-axis labels -->
        <text
          v-for="(label, i) in labels"
          :key="`label-${i}`"
          :x="getX(i)"
          :y="height - 5"
          text-anchor="middle"
          class="axis-label"
        >
          {{ label }}
        </text>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface SeriesData {
  label: string
  data: number[]
  color: string
}

const props = withDefaults(
  defineProps<{
    title: string
    icon?: string
    labels: string[]
    seriesData: SeriesData[]
    width?: number
    height?: number
  }>(),
  {
    icon: '📈',
    width: 600,
    height: 300
  }
)

const padding = 40

const maxValue = computed(() => {
  const allValues = props.seriesData.flatMap(s => s.data)
  return Math.max(...allValues, 0)
})

const getX = (index: number) => {
  const chartWidth = props.width - padding * 2
  return padding + (chartWidth / (props.labels.length - 1)) * index
}

const getY = (value: number) => {
  const chartHeight = props.height - padding * 2
  const ratio = value / maxValue.value
  return props.height - padding - ratio * chartHeight
}

const getLinePoints = (data: number[]) => {
  return data.map((value, index) => `${getX(index)},${getY(value)}`).join(' ')
}
</script>

<style scoped>
.chart-container {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.chart-legend {
  display: flex;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.chart-body {
  overflow-x: auto;
}

.line-chart {
  display: block;
}

.axis-label {
  font-size: 11px;
  fill: var(--text-tertiary);
}

.data-point {
  cursor: pointer;
  transition: r 0.2s;
}

.data-point:hover {
  r: 6;
}
</style>
