import type { User, AuthSession } from '@/types'
import { createSpan } from '@/utils/span'

export interface OAuthConfig {
  clientId: string
  redirectUri: string
  scope: string[]
  authEndpoint: string
  tokenEndpoint: string
  userInfoEndpoint: string
}

export type OAuthProvider = 'google' | 'github'

// OAuth configurations for each provider
const OAUTH_CONFIGS: Record<OAuthProvider, Partial<OAuthConfig>> = {
  google: {
    authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scope: ['openid', 'email', 'profile']
  },
  github: {
    authEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userInfoEndpoint: 'https://api.github.com/user',
    scope: ['read:user', 'user:email']
  }
}

// Configuration keys (should be set via environment or settings)
const CONFIG_KEYS: Record<OAuthProvider, { clientId: string; clientSecret?: string }> = {
  google: {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  },
  github: {
    clientId: import.meta.env.VITE_GITHUB_CLIENT_ID || '',
  }
}

export class OAuthClient {
  private provider: OAuthProvider
  private config: OAuthConfig

  constructor(provider: OAuthProvider) {
    this.provider = provider
    const baseConfig = OAUTH_CONFIGS[provider]
    const keys = CONFIG_KEYS[provider]

    if (!keys.clientId) {
      throw new Error(`OAuth client ID not configured for ${provider}`)
    }

    this.config = {
      clientId: keys.clientId,
      redirectUri: `${window.location.origin}/auth/callback`,
      scope: baseConfig.scope || [],
      authEndpoint: baseConfig.authEndpoint || '',
      tokenEndpoint: baseConfig.tokenEndpoint || '',
      userInfoEndpoint: baseConfig.userInfoEndpoint || ''
    }
  }

  /**
   * Generate OAuth authorization URL and redirect
   */
  async initiateLogin(): Promise<void> {
    const span = createSpan({
      name: 'oauth.initiateLogin',
      attributes: { provider: this.provider }
    })

    try {
      const state = this.generateState()
      const codeVerifier = this.generateCodeVerifier()

      // Store state and code verifier for validation
      sessionStorage.setItem('oauth_state', state)
      sessionStorage.setItem('oauth_code_verifier', codeVerifier)
      sessionStorage.setItem('oauth_provider', this.provider)

      const codeChallenge = await this.generateCodeChallenge(codeVerifier)

      const params = new URLSearchParams({
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        response_type: 'code',
        scope: this.config.scope.join(' '),
        state,
        ...(this.provider === 'google' && {
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          access_type: 'offline',
          prompt: 'consent'
        })
      })

      const authUrl = `${this.config.authEndpoint}?${params.toString()}`

      span.addEvent('redirect_to_oauth', { provider: this.provider })
      await span.end('ok')

      // Redirect to OAuth provider
      window.location.href = authUrl
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Handle OAuth callback and exchange code for token
   */
  async handleCallback(callbackUrl: string): Promise<AuthSession> {
    const span = createSpan({
      name: 'oauth.handleCallback',
      attributes: { provider: this.provider }
    })

    try {
      const url = new URL(callbackUrl)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        throw new Error(`OAuth error: ${error}`)
      }

      if (!code || !state) {
        throw new Error('Missing code or state parameter')
      }

      // Validate state
      const savedState = sessionStorage.getItem('oauth_state')
      if (state !== savedState) {
        throw new Error('Invalid state parameter')
      }

      span.addEvent('state_validated')

      // Exchange code for token
      const token = await this.exchangeCodeForToken(code)
      span.addEvent('token_exchanged')

      // Fetch user info
      const user = await this.fetchUserInfo(token)
      span.addEvent('user_info_fetched', { userId: user.id })

      // Clean up session storage
      sessionStorage.removeItem('oauth_state')
      sessionStorage.removeItem('oauth_code_verifier')
      sessionStorage.removeItem('oauth_provider')

      const session: AuthSession = {
        user,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      }

      await span.end('ok')
      return session
    } catch (error) {
      await span.end('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(code: string): Promise<string> {
    const codeVerifier = sessionStorage.getItem('oauth_code_verifier')

    const body: Record<string, string> = {
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      code,
      grant_type: 'authorization_code'
    }

    if (this.provider === 'google' && codeVerifier) {
      body.code_verifier = codeVerifier
    }

    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(this.provider === 'github' && { Accept: 'application/json' })
      },
      body: new URLSearchParams(body)
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Token exchange failed: ${errorData}`)
    }

    const data = await response.json()
    return data.access_token
  }

  /**
   * Fetch user information using access token
   */
  private async fetchUserInfo(token: string): Promise<User> {
    const response = await fetch(this.config.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(this.provider === 'github' && { Accept: 'application/vnd.github.v3+json' })
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch user info')
    }

    const data = await response.json()

    // Map provider-specific response to User interface
    if (this.provider === 'google') {
      return {
        id: data.id,
        email: data.email,
        name: data.name,
        avatar: data.picture,
        provider: 'google',
        logLineId: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      }
    } else if (this.provider === 'github') {
      // For GitHub, we might need to fetch email separately if not public
      let email = data.email
      if (!email) {
        const emailResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json'
          }
        })
        if (emailResponse.ok) {
          const emails = await emailResponse.json()
          const primaryEmail = emails.find((e: any) => e.primary)
          email = primaryEmail?.email || emails[0]?.email
        }
      }

      return {
        id: String(data.id),
        email: email || `${data.login}@github.local`,
        name: data.name || data.login,
        avatar: data.avatar_url,
        provider: 'github',
        logLineId: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      }
    }

    throw new Error(`Unknown provider: ${this.provider}`)
  }

  /**
   * Generate random state for CSRF protection
   */
  private generateState(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Generate code verifier for PKCE
   */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return this.base64UrlEncode(array)
  }

  /**
   * Generate code challenge from verifier
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return this.base64UrlEncode(new Uint8Array(hash))
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(array: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...array))
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }
}

/**
 * Initialize OAuth login flow
 */
export async function initiateOAuthLogin(provider: OAuthProvider): Promise<void> {
  const client = new OAuthClient(provider)
  await client.initiateLogin()
}

/**
 * Handle OAuth callback
 */
export async function handleOAuthCallback(provider: OAuthProvider, callbackUrl: string): Promise<AuthSession> {
  const client = new OAuthClient(provider)
  return await client.handleCallback(callbackUrl)
}

/**
 * Check if OAuth is configured for a provider
 */
export function isOAuthConfigured(provider: OAuthProvider): boolean {
  return !!CONFIG_KEYS[provider].clientId
}
