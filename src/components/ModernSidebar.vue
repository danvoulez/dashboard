<template>
  <aside class="modern-sidebar" :class="{ collapsed }">
    <div class="sidebar-header">
      <div class="logo">
        <span class="logo-icon">⚡</span>
        <span v-if="!collapsed" class="logo-text">Dashboard Pro</span>
      </div>
      <button @click="collapsed = !collapsed" class="collapse-btn">
        <span v-if="collapsed">→</span>
        <span v-else>←</span>
      </button>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-section">
        <span v-if="!collapsed" class="section-label">MAIN</span>
        <router-link to="/" class="nav-item" exact-active-class="active">
          <span class="nav-icon">📊</span>
          <span v-if="!collapsed" class="nav-label">Overview</span>
        </router-link>
        <router-link to="/analytics" class="nav-item" active-class="active">
          <span class="nav-icon">📈</span>
          <span v-if="!collapsed" class="nav-label">Analytics</span>
        </router-link>
        <router-link to="/tasks" class="nav-item" active-class="active">
          <span class="nav-icon">✓</span>
          <span v-if="!collapsed" class="nav-label">Tasks</span>
          <span v-if="!collapsed && taskCount > 0" class="nav-badge">{{ taskCount }}</span>
        </router-link>
        <router-link to="/timeline" class="nav-item" active-class="active">
          <span class="nav-icon">⏱</span>
          <span v-if="!collapsed" class="nav-label">Timeline</span>
        </router-link>
      </div>

      <div class="nav-section">
        <span v-if="!collapsed" class="section-label">WORKSPACE</span>
        <router-link to="/plugins" class="nav-item" active-class="active">
          <span class="nav-icon">🔌</span>
          <span v-if="!collapsed" class="nav-label">Plugins</span>
        </router-link>
        <router-link to="/settings" class="nav-item" active-class="active">
          <span class="nav-icon">⚙</span>
          <span v-if="!collapsed" class="nav-label">Settings</span>
        </router-link>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div v-if="user" class="user-info">
        <div class="user-avatar">{{ userInitials }}</div>
        <div v-if="!collapsed" class="user-details">
          <div class="user-name">{{ user.name }}</div>
          <div class="user-email">{{ user.email }}</div>
        </div>
      </div>
      <button v-if="!collapsed" @click="toggleDarkMode" class="theme-toggle">
        <span>{{ isDark ? '☀️' : '🌙' }}</span>
        <span>{{ isDark ? 'Light' : 'Dark' }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTaskStore } from '@/stores/tasks'

const collapsed = ref(false)
const authStore = useAuthStore()
const taskStore = useTaskStore()

const user = computed(() => authStore.user)
const taskCount = computed(() => taskStore.tasks?.filter(t => t.status !== 'done').length || 0)
const isDark = computed(() => document.documentElement.classList.contains('dark'))

const userInitials = computed(() => {
  if (!user.value?.name) return 'U'
  return user.value.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
})

const toggleDarkMode = () => {
  document.documentElement.classList.toggle('dark')
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}
</script>

<style scoped>
.modern-sidebar {
  width: 240px;
  height: 100vh;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 100;
}

.modern-sidebar.collapsed {
  width: 64px;
}

.sidebar-header {
  height: 56px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 15px;
}

.logo-icon {
  font-size: 20px;
}

.logo-text {
  white-space: nowrap;
}

.collapse-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
  transition: background 0.2s;
}

.collapse-btn:hover {
  background: var(--bg-tertiary);
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

.nav-section {
  margin-bottom: 24px;
}

.section-label {
  display: block;
  padding: 8px 20px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s;
  position: relative;
  font-size: 14px;
  font-weight: 500;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  color: var(--accent-primary);
  background: var(--accent-bg);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent-primary);
}

.nav-icon {
  font-size: 18px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
  white-space: nowrap;
}

.nav-badge {
  background: var(--accent-primary);
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  min-width: 20px;
  text-align: center;
}

.sidebar-footer {
  border-top: 1px solid var(--border-color);
  padding: 12px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.user-info:hover {
  background: var(--bg-hover);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-toggle {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.theme-toggle:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
}

.modern-sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 10px;
}

.modern-sidebar.collapsed .sidebar-footer {
  padding: 8px;
}

.modern-sidebar.collapsed .user-info {
  justify-content: center;
  padding: 8px;
}

/* Scrollbar */
.sidebar-nav::-webkit-scrollbar {
  width: 6px;
}

.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  background: var(--bg-tertiary);
  border-radius: 3px;
}

.sidebar-nav::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
</style>
