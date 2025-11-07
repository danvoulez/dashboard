import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ServiceModule, PluginMetadata } from '@/types'
import { createSpan } from '@/utils/span'

export const usePluginStore = defineStore('plugins', () => {
  const plugins = ref<Map<string, ServiceModule>>(new Map())
  const loading = ref(false)

  const enabledPlugins = computed(() => {
    return Array.from(plugins.value.values())
      .filter(p => p.metadata.enabled)
  })

  const pluginList = computed(() => {
    return Array.from(plugins.value.values())
  })

  async function registerPlugin(plugin: ServiceModule) {
    const span = createSpan({
      name: 'plugins.register',
      attributes: { pluginId: plugin.metadata.id }
    })

    try {
      // Validate plugin
      if (!plugin.metadata.id) {
        throw new Error('Plugin must have an id')
      }

      if (plugins.value.has(plugin.metadata.id)) {
        throw new Error(`Plugin ${plugin.metadata.id} is already registered`)
      }

      // Register plugin
      plugins.value.set(plugin.metadata.id, plugin)

      // Run initialization if provided
      if (plugin.onInit) {
        span.addEvent('plugin_init_start')
        await plugin.onInit()
        span.addEvent('plugin_init_complete')
      }

      span.addEvent('plugin_registered', { pluginId: plugin.metadata.id })
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function unregisterPlugin(pluginId: string) {
    const span = createSpan({
      name: 'plugins.unregister',
      attributes: { pluginId }
    })

    try {
      if (!plugins.value.has(pluginId)) {
        throw new Error(`Plugin ${pluginId} not found`)
      }

      plugins.value.delete(pluginId)

      span.addEvent('plugin_unregistered', { pluginId })
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function togglePlugin(pluginId: string, enabled: boolean) {
    const span = createSpan({
      name: 'plugins.toggle',
      attributes: { pluginId, enabled }
    })

    try {
      const plugin = plugins.value.get(pluginId)
      if (!plugin) {
        throw new Error(`Plugin ${pluginId} not found`)
      }

      plugin.metadata.enabled = enabled

      span.addEvent('plugin_toggled', { pluginId, enabled })
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  function getPlugin(pluginId: string): ServiceModule | undefined {
    return plugins.value.get(pluginId)
  }

  function hasPlugin(pluginId: string): boolean {
    return plugins.value.has(pluginId)
  }

  async function loadPlugins() {
    const span = createSpan({ name: 'plugins.load' })

    try {
      loading.value = true

      // Dynamic import of plugin modules
      const pluginModules = import.meta.glob('@/services/*/index.ts')

      for (const path in pluginModules) {
        try {
          const module = await pluginModules[path]() as { default: ServiceModule }
          await registerPlugin(module.default)
        } catch (error) {
          console.error(`Failed to load plugin from ${path}:`, error)
          span.addEvent('plugin_load_error', { path, error: String(error) })
        }
      }

      span.setAttribute('pluginCount', plugins.value.size)
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      loading.value = false
    }
  }

  return {
    plugins: pluginList,
    enabledPlugins,
    loading,
    registerPlugin,
    unregisterPlugin,
    togglePlugin,
    getPlugin,
    hasPlugin,
    loadPlugins
  }
})
