<template>
  <div class="example-plugin">
    <h2>Example Plugin</h2>
    <p class="text-secondary">This is a demonstration of the service module pattern.</p>

    <div class="card">
      <h3>Plugin Features</h3>
      <ul>
        <li>Automatic registration via import.meta.glob</li>
        <li>Lifecycle hooks (onInit, onSpan)</li>
        <li>Component-based UI</li>
        <li>Configuration management</li>
        <li>Permission system</li>
      </ul>
    </div>

    <div class="card">
      <h3>Plugin Status</h3>
      <p>Status: <span class="badge badge-success">Active</span></p>
      <p>Version: {{ config.version }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { config } from './config'
</script>

<style scoped>
.example-plugin {
  padding: var(--spacing-lg);
}

ul {
  list-style-position: inside;
  margin-top: var(--spacing-md);
}

li {
  padding: var(--spacing-xs) 0;
}
</style>
