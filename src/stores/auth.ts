import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, AuthSession } from '@/types'
import { createSpan } from '@/utils/span'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(null)
  const isAuthenticated = computed(() => !!session.value)
  const user = computed(() => session.value?.user)

  async function login(provider: 'google' | 'github' | 'telegram') {
    const span = createSpan({
      name: 'auth.login',
      attributes: { provider }
    })

    try {
      // In a real implementation, this would redirect to OAuth provider
      // For now, we'll simulate a login
      span.addEvent('oauth_redirect', { provider })

      // Simulate OAuth callback response
      const mockUser: User = {
        id: crypto.randomUUID(),
        email: `user@${provider}.com`,
        name: 'Test User',
        provider,
        logLineId: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      }

      session.value = {
        user: mockUser,
        token: 'mock-jwt-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }

      span.addEvent('login_success', { userId: mockUser.id })
      await span.end('ok')

      return session.value
    } catch (error) {
      span.addEvent('login_error', { error: String(error) })
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function logout() {
    const span = createSpan({
      name: 'auth.logout',
      attributes: { userId: user.value?.id }
    })

    try {
      session.value = null
      await span.end('ok')
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  function checkSession(): boolean {
    if (!session.value) return false

    const now = new Date()
    const expiresAt = new Date(session.value.expiresAt)

    if (expiresAt < now) {
      session.value = null
      return false
    }

    return true
  }

  return {
    session,
    isAuthenticated,
    user,
    login,
    logout,
    checkSession
  }
}, {
  persist: {
    storage: localStorage,
    paths: ['session']
  }
})
