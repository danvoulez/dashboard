<template>
  <div class="timeline-view">
    <div class="timeline-header">
      <h1>Timeline</h1>
      <p class="text-secondary">View your activity history, spans, and completed tasks.</p>
    </div>

    <div class="card">
      <div class="empty-state">
        <p class="text-secondary">Timeline feature coming soon</p>
        <p class="text-xs text-tertiary">
          This will show executed spans, completed tasks, focus sessions, and file uploads in chronological order.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Timeline view - displays chronological activity
</script>

<style scoped>
.timeline-view {
  padding: var(--spacing-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.timeline-header {
  margin-bottom: var(--spacing-xl);
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xl);
}
</style>
