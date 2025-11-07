<template>
  <div class="login-container">
    <div class="login-card card">
      <div class="login-header">
        <h1>Radar Dashboard</h1>
        <p class="text-secondary">
          Centralizar visão operacional, lista de tarefas inteligentes e execução modular
        </p>
      </div>

      <div class="login-providers">
        <button @click="handleLogin('google')" class="provider-btn">
          <span class="provider-icon">G</span>
          <span>Continue with Google</span>
        </button>

        <button @click="handleLogin('github')" class="provider-btn">
          <span class="provider-icon">GH</span>
          <span>Continue with GitHub</span>
        </button>

        <button @click="handleLogin('telegram')" class="provider-btn">
          <span class="provider-icon">T</span>
          <span>Continue with Telegram</span>
        </button>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const error = ref<string | null>(null)

async function handleLogin(provider: 'google' | 'github' | 'telegram') {
  try {
    error.value = null
    await authStore.login(provider)
    router.push('/')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Login failed'
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--spacing-md);
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
}

.login-card {
  max-width: 400px;
  width: 100%;
}

.login-header {
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.login-header h1 {
  margin-bottom: var(--spacing-sm);
}

.login-providers {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.provider-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
}

.provider-btn:hover {
  background-color: var(--bg-secondary);
  border-color: var(--accent-primary);
}

.provider-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background-color: var(--bg-secondary);
  font-weight: 600;
}

.error-message {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: rgba(239, 68, 68, 0.1);
  color: var(--error);
  font-size: 0.875rem;
  text-align: center;
}
</style>
