/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GITHUB_CLIENT_ID?: string
  readonly VITE_TELEGRAM_BOT_TOKEN?: string
  readonly VITE_LLM_PROVIDER?: string
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_OPENAI_MODEL?: string
  readonly VITE_OLLAMA_ENDPOINT?: string
  readonly VITE_OLLAMA_MODEL?: string
  readonly VITE_MACMIND_ENDPOINT?: string
  readonly VITE_MACMIND_API_KEY?: string
  readonly VITE_MACMIND_MODEL?: string
  readonly VITE_ENABLE_LLM?: string
  readonly VITE_ENABLE_POLICIES?: string
  readonly VITE_ENABLE_WEBHOOKS?: string
  readonly VITE_ENABLE_OBSERVER_BOT?: string
  readonly VITE_APP_NAME?: string
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
  readonly glob: (pattern: string) => Record<string, any>
}
