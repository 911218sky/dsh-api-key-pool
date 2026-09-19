export interface KeyState {
  failCount: number
  cooldownUntil: number
}

export interface PoolConfigEntry {
  apiKeyEnv?: string
  keys?: string[]
  cooldownMs?: number
}

export interface PluginConfig {
  pools?: Record<string, PoolConfigEntry>
  defaultCooldownMs?: number
}

export interface PersistedPools {
  pools?: Record<
    string,
    {
      apiKeyEnv?: string
      keys?: string[]
    }
  >
}

export interface PoolRuntime {
  env: string
  keys: string[]
  cooldown: number
  idx: number
  states: Map<string, KeyState>
}

export interface LoggerLike {
  info?: (msg: string) => void
  warn?: (msg: string) => void
  error?: (msg: string) => void
}

export interface PluginContext {
  logger?: LoggerLike
  on: (event: string, handler: (...args: any[]) => any) => void
  effect: (fn: () => void | (() => void), label?: string) => void
  get?: (name: string) => any
  webServer: {
    register: (route: {
      kind: 'exact'
      path: string
      handler: (req: any, res: any) => void | Promise<void>
    }) => void | (() => void)
  }
}

export interface PoolPublicView {
  apiKeyEnv: string
  maskedKeys: string[]
  keyCount: number
  mode: string
  states: Record<string, KeyState>
}

export const API_BASE = '/dsh-api-key-pool'
export const DEFAULT_COOLDOWN_MS = 30_000

export const RETRYABLE_CODES = new Set([
  'RATE_LIMIT',
  'AUTH',
  'QUOTA_EXCEEDED',
  'TIMEOUT',
  'TRANSPORT',
])
