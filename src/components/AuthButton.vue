<template>
  <div class="auth-button">
    <div v-if="isAuthenticated" class="user-menu">
      <button @click="toggleMenu" class="user-avatar">
        <img v-if="user?.avatar" :src="user.avatar" :alt="user.name" />
        <span v-else class="avatar-placeholder">{{ userInitials }}</span>
      </button>

      <div v-if="showMenu" class="dropdown-menu">
        <div class="user-info">
          <div class="user-name">{{ user?.name }}</div>
          <div class="user-email">{{ user?.email }}</div>
        </div>

        <div class="menu-divider"></div>

        <button @click="handleLogout" class="menu-item logout">
          <span>🚪</span>
          <span>Sair</span>
        </button>
      </div>
    </div>

    <div v-else class="login-buttons">
      <button @click="loginWithGoogle" class="btn-oauth google">
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.593.102-1.17.282-1.709V4.958H.957C.347 6.173 0 7.548 0 9c0 1.452.348 2.827.957 4.042l3.007-2.335z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
        <span>Entrar com Google</span>
      </button>

      <button @click="loginWithGitHub" class="btn-oauth github">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <span>Entrar com GitHub</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { storeToRefs } from 'pinia'

const authStore = useAuthStore()
const { isAuthenticated, user } = storeToRefs(authStore)

const showMenu = ref(false)

const userInitials = computed(() => {
  if (!user.value?.name) return '?'
  const names = user.value.name.split(' ')
  if (names.length >= 2) {
    return (names[0][0] + names[1][0]).toUpperCase()
  }
  return names[0][0].toUpperCase()
})

function toggleMenu() {
  showMenu.value = !showMenu.value
}

async function loginWithGoogle() {
  try {
    await authStore.login('google')
  } catch (error) {
    console.error('Google login failed:', error)
  }
}

async function loginWithGitHub() {
  try {
    await authStore.login('github')
  } catch (error) {
    console.error('GitHub login failed:', error)
  }
}

async function handleLogout() {
  await authStore.logout()
  showMenu.value = false
}

// Close menu when clicking outside
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.closest('.auth-button')) {
      showMenu.value = false
    }
  })
}
</script>

<style scoped>
.auth-button {
  position: relative;
}

.user-menu {
  position: relative;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--border-color, #e0e0e0);
  background: var(--bg-primary, white);
  cursor: pointer;
  padding: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.user-avatar:hover {
  border-color: var(--color-primary, #007bff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-weight: 600;
  color: var(--text-primary, #333);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  min-width: 200px;
  background: white;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  overflow: hidden;
}

.user-info {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.user-name {
  font-weight: 600;
  color: var(--text-primary, #333);
  margin-bottom: 0.25rem;
}

.user-email {
  font-size: 0.875rem;
  color: var(--text-secondary, #666);
}

.menu-divider {
  height: 1px;
  background: var(--border-color, #e0e0e0);
}

.menu-item {
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  transition: background 0.2s;
  color: var(--text-primary, #333);
}

.menu-item:hover {
  background: var(--bg-hover, #f0f0f0);
}

.menu-item.logout {
  color: var(--color-danger, #dc3545);
}

.login-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.btn-oauth {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.75rem 1.5rem;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.2s;
  color: var(--text-primary, #333);
}

.btn-oauth:hover {
  background: var(--bg-hover, #f8f9fa);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.btn-oauth svg {
  flex-shrink: 0;
}

.btn-oauth.google:hover {
  border-color: #4285F4;
}

.btn-oauth.github:hover {
  border-color: #333;
}
</style>
