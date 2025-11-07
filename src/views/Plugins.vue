<template>
  <div class="plugins-view">
    <div class="plugins-header">
      <h1>Plugins & Services</h1>
      <p class="text-secondary">Manage your installed service modules.</p>
    </div>

    <div v-if="pluginStore.loading" class="loading-state">
      <p>Loading plugins...</p>
    </div>

    <div v-else-if="pluginStore.plugins.length === 0" class="card">
      <div class="empty-state">
        <p class="text-secondary">No plugins installed</p>
        <p class="text-xs text-tertiary">
          Create plugins in the /src/services directory following the service module pattern.
        </p>
      </div>
    </div>

    <div v-else class="plugins-grid">
      <div v-for="plugin in pluginStore.plugins" :key="plugin.metadata.id" class="card plugin-card">
        <div class="plugin-header">
          <div class="plugin-icon">{{ plugin.metadata.icon }}</div>
          <div class="plugin-info">
            <h3>{{ plugin.metadata.title }}</h3>
            <p class="text-sm text-secondary">{{ plugin.metadata.description || 'No description' }}</p>
          </div>
        </div>

        <div class="plugin-footer">
          <span :class="plugin.metadata.enabled ? 'badge-success' : 'badge'" class="badge">
            {{ plugin.metadata.enabled ? 'Enabled' : 'Disabled' }}
          </span>
          <button
            @click="togglePlugin(plugin.metadata.id, !plugin.metadata.enabled)"
            class="btn-secondary btn-sm"
          >
            {{ plugin.metadata.enabled ? 'Disable' : 'Enable' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePluginStore } from '@/stores/plugins'

const pluginStore = usePluginStore()

async function togglePlugin(pluginId: string, enabled: boolean) {
  await pluginStore.togglePlugin(pluginId, enabled)
}
</script>

<style scoped>
.plugins-view {
  padding: var(--spacing-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.plugins-header {
  margin-bottom: var(--spacing-xl);
}

.plugins-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-lg);
}

.plugin-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.plugin-header {
  display: flex;
  gap: var(--spacing-md);
}

.plugin-icon {
  font-size: 2rem;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.plugin-info {
  flex: 1;
  min-width: 0;
}

.plugin-info h3 {
  margin-bottom: var(--spacing-xs);
}

.plugin-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-color);
}

.loading-state,
.empty-state {
  text-align: center;
  padding: var(--spacing-xl);
}
</style>
