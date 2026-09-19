import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  KeyState,
  PersistedPools,
  PluginConfig,
  PluginContextWithEvents,
  PoolConfigEntry,
  PoolPublicView,
  PoolRuntime,
} from './types.js'
import { DEFAULT_COOLDOWN_MS } from './types.js'
import {
  assertSafeApiKeyEnv,
  discoverProvidersFromSettings,
  ensureStorageDir,
  errorMessage,
  legacyPoolConfigPath,
  log,
  maskKey,
  poolConfigPath,
} from './util.js'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function emptyState(): KeyState {
  return { failCount: 0, cooldownUntil: 0 }
}

function defaultApiKeyEnv(provider: string): string {
  const env = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`
  try {
    assertSafeApiKeyEnv(env)
    return env
  } catch {
    return 'PROVIDER_API_KEY'
  }
}

function sanitizeApiKeyEnv(name: string | undefined, provider: string): string {
  if (name) {
    try {
      assertSafeApiKeyEnv(name)
      return name
    } catch (err: unknown) {
      // Fall back rather than abort bootstrap for a bad persisted/config value.
      void err
    }
  }
  return defaultApiKeyEnv(provider)
}

function writeSecretFile(path: string, contents: string): void {
  writeFileSync(path, contents, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(path, 0o600)
  } catch {
    // ignore chmod failures on exotic FS
  }
}

function readPersisted(): PersistedPools {
  ensureStorageDir()
  const primary = poolConfigPath()
  const legacy = legacyPoolConfigPath(PACKAGE_ROOT)
  try {
    if (!existsSync(primary) && existsSync(legacy)) {
      // one-time migrate from node_modules package dir → DSH_HOME/storages
      mkdirSync(dirname(primary), { recursive: true, mode: 0o700 })
      renameSync(legacy, primary)
      try {
        chmodSync(primary, 0o600)
      } catch {
        // ignore
      }
    }
  } catch {
    try {
      if (existsSync(legacy) && !existsSync(primary)) {
        writeSecretFile(primary, readFileSync(legacy, 'utf8'))
      }
    } catch {
      // ignore migrate failures
    }
  }

  try {
    if (!existsSync(primary)) return {}
    const parsed: unknown = JSON.parse(readFileSync(primary, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as PersistedPools
  } catch {
    return {}
  }
}

/**
 * Merge persisted + static config keys.
 * - Prefer union so an empty persisted list does not wipe YAML seed keys on first boot.
 * - Persisted order first, then config-only extras.
 */
function mergeKeys(persistedKeys: string[] | undefined, configKeys: string[] | undefined): string[] {
  const a = Array.isArray(persistedKeys) ? persistedKeys.filter(Boolean) : []
  const b = Array.isArray(configKeys) ? configKeys.filter(Boolean) : []
  if (a.length === 0) return [...new Set(b)]
  if (b.length === 0) return [...new Set(a)]
  return [...new Set([...a, ...b])]
}

export class KeyPoolManager {
  readonly pools = new Map<string, PoolRuntime>()
  readonly modes = new Map<string, string>()
  /** Per-provider stack of keys bound to in-flight requests (LIFO). */
  private readonly inflight = new Map<string, string[]>()
  /** Last successfully used key per provider (for markSuccess heuristics). */
  private readonly lastSuccessCandidate = new Map<string, string>()
  private readonly probeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly envQueues = new Map<string, Promise<unknown>>()
  private readonly lifetime = new AbortController()
  private readonly defaultCooldownMs: number
  private readonly ctx: PluginContextWithEvents

  constructor(ctx: PluginContextWithEvents, config: PluginConfig = {}) {
    this.ctx = ctx
    this.defaultCooldownMs = config.defaultCooldownMs ?? DEFAULT_COOLDOWN_MS
    this.bootstrap(config)
  }

  private bootstrap(config: PluginConfig): void {
    const persisted = readPersisted()
    const merged: Record<string, PoolConfigEntry> = { ...(config.pools || {}) }

    for (const [provider, entry] of Object.entries(persisted.pools || {})) {
      const cur = merged[provider] || {}
      merged[provider] = {
        apiKeyEnv: entry.apiKeyEnv || cur.apiKeyEnv,
        keys: mergeKeys(entry.keys, cur.keys),
        cooldownMs: cur.cooldownMs,
      }
    }

    const names = new Set([
      ...Object.keys(merged),
      ...discoverProvidersFromSettings(this.ctx),
    ])

    for (const provider of names) {
      const pcfg = merged[provider] || {}
      const env = sanitizeApiKeyEnv(pcfg.apiKeyEnv, provider)
      const fromCfg = Array.isArray(pcfg.keys) ? pcfg.keys.filter(Boolean) : []
      const envValue = process.env[env]
      const fromEnv = envValue && envValue !== 'public' ? [envValue] : []
      const keys = [...new Set([...fromCfg, ...fromEnv])]
      const cooldown = pcfg.cooldownMs || this.defaultCooldownMs
      this.pools.set(provider, {
        env,
        keys,
        cooldown,
        idx: 0,
        states: new Map(keys.map((k) => [k, emptyState()])),
      })
      if (keys.length > 0) {
        log(this.ctx, 'info', `pool '${provider}': ${keys.length} key(s)`)
      }
    }

    log(
      this.ctx,
      'info',
      `loaded ${this.pools.size} pool(s): ${[...this.pools.keys()].join(', ') || '(none)'}`,
    )
  }

  persist(): void {
    try {
      ensureStorageDir()
      const out: PersistedPools = { pools: {} }
      for (const [provider, pool] of this.pools) {
        out.pools![provider] = { apiKeyEnv: pool.env, keys: pool.keys }
      }
      writeSecretFile(poolConfigPath(), JSON.stringify(out, null, 2))
    } catch (err: unknown) {
      log(this.ctx, 'warn', `persist failed: ${errorMessage(err)}`)
    }
  }

  hasHealthyKey(provider: string): boolean {
    const pool = this.pools.get(provider)
    if (!pool || pool.keys.length === 0) return false
    const now = Date.now()
    return pool.keys.some((k) => (pool.states.get(k)?.cooldownUntil || 0) <= now)
  }

  pickKey(provider: string): string | undefined {
    const pool = this.pools.get(provider)
    if (!pool || pool.keys.length === 0) return undefined

    const now = Date.now()
    const live = pool.keys.filter((k) => (pool.states.get(k)?.cooldownUntil || 0) <= now)
    if (live.length === 0) {
      log(this.ctx, 'warn', `pool '${provider}': all keys cooling`)
      return undefined
    }

    for (let i = 0; i < live.length; i++) {
      const key = live[(pool.idx + i) % live.length]!
      const realIdx = pool.keys.indexOf(key)
      if (realIdx >= 0) {
        pool.idx = (realIdx + 1) % pool.keys.length
        return key
      }
    }
    return live[0]
  }

  /** Bind a key to the current in-flight request for this provider. */
  bindInflight(provider: string, key: string): void {
    const stack = this.inflight.get(provider) || []
    stack.push(key)
    this.inflight.set(provider, stack)
    this.lastSuccessCandidate.set(provider, key)
  }

  /** Pop the key bound to the failing request (LIFO). */
  takeInflightKey(provider: string): string | undefined {
    const stack = this.inflight.get(provider)
    if (!stack || stack.length === 0) return undefined
    return stack.pop()
  }

  /** Drop inflight binding after a successful turn start for a new non-retry request. */
  clearInflight(provider: string): void {
    this.inflight.delete(provider)
  }

  markSuccess(provider: string, key: string): void {
    const pool = this.pools.get(provider)
    if (!pool || !key) return
    const st = pool.states.get(key)
    if (st) {
      st.failCount = 0
      st.cooldownUntil = 0
    }
    const t = this.probeTimers.get(key)
    if (t) {
      clearTimeout(t)
      this.probeTimers.delete(key)
    }
  }

  /** Mark previous candidate successful when starting a fresh (non-retry) request. */
  markPreviousSuccess(provider: string): void {
    const key = this.lastSuccessCandidate.get(provider)
    if (key) this.markSuccess(provider, key)
  }

  markFailed(provider: string, key: string, reason: string): void {
    const pool = this.pools.get(provider)
    if (!pool || !key) return
    const st = pool.states.get(key)
    if (!st) return

    st.failCount += 1
    const backoff = pool.cooldown * Math.min(st.failCount, 5)
    st.cooldownUntil = Date.now() + backoff
    log(
      this.ctx,
      'warn',
      `key ${maskKey(key)} for '${provider}' failed (${reason}), cooldown ${backoff}ms`,
    )

    const prev = this.probeTimers.get(key)
    if (prev) clearTimeout(prev)
    if (!this.lifetime.signal.aborted) {
      this.probeTimers.set(
        key,
        setTimeout(() => {
          this.probeTimers.delete(key)
          st.failCount = 0
          st.cooldownUntil = 0
          log(this.ctx, 'info', `key ${maskKey(key)} for '${provider}' finished cooldown`)
        }, backoff + 100),
      )
    }
  }

  applyKeyToEnv(provider: string, key: string): void {
    const pool = this.pools.get(provider)
    if (!pool || !key) return
    const envName = pool.env
    process.env[envName] = key
    // rc.1+: llm-pi-ai resolves apiKeyEnv via credentials snapshot — process.env
    // alone is invisible. Persist through credentials.set so rotation takes effect.
    try {
      const creds = this.ctx.get?.('credentials') as { set?: (n: string, v: string) => Promise<unknown> | unknown } | undefined
      if (creds && typeof creds.set === 'function') {
        void Promise.resolve(creds.set(envName, key)).catch((err: unknown) => {
          log(this.ctx, 'warn', `credentials.set(${envName}) failed: ${errorMessage(err)}`)
        })
      }
    } catch (err: unknown) {
      log(this.ctx, 'warn', `credentials write skipped: ${errorMessage(err)}`)
    }
  }

  /**
   * Also stamp common call-config fields so credential resolution that already
   * captured env is less likely to miss the rotated key (best-effort).
   */
  applyKeyToCallConfig(
    call: { apiKey?: string; headers?: Record<string, string>; authorization?: string },
    key: string,
  ): void {
    call.apiKey = key
    call.authorization = `Bearer ${key}`
    const headers = { ...(call.headers || {}) }
    headers.Authorization = `Bearer ${key}`
    call.headers = headers
  }

  withEnvSerial<T>(provider: string, fn: () => T | Promise<T>): Promise<T> {
    const prev = this.envQueues.get(provider) || Promise.resolve()
    const next = prev.then(fn, fn)
    this.envQueues.set(provider, next)
    return next
  }

  ensurePool(provider: string, apiKeyEnv?: string, firstKey?: string): PoolRuntime {
    let pool = this.pools.get(provider)
    if (!pool) {
      const env = sanitizeApiKeyEnv(apiKeyEnv, provider)
      const keys = firstKey ? [firstKey] : []
      pool = {
        env,
        keys,
        cooldown: this.defaultCooldownMs,
        idx: 0,
        states: new Map(keys.map((k) => [k, emptyState()])),
      }
      this.pools.set(provider, pool)
    } else if (apiKeyEnv) {
      pool.env = sanitizeApiKeyEnv(apiKeyEnv, provider)
    }
    return pool
  }

  addKey(provider: string, key: string): void {
    const pool = this.ensurePool(provider, undefined, key)
    if (!pool.keys.includes(key)) {
      pool.keys.push(key)
      pool.states.set(key, emptyState())
    }
    this.persist()
  }

  removeKeyAt(provider: string, index: number): boolean {
    const pool = this.pools.get(provider)
    if (!pool || index < 0 || index >= pool.keys.length) return false
    const [removed] = pool.keys.splice(index, 1)
    if (removed) pool.states.delete(removed)
    pool.idx = 0
    this.persist()
    return true
  }

  updateKeys(provider: string, keys: string[]): void {
    const pool = this.ensurePool(provider)
    pool.keys = keys.filter(Boolean)
    pool.states = new Map(pool.keys.map((k) => [k, emptyState()]))
    pool.idx = 0
    this.persist()
  }

  resetCooldown(provider: string): void {
    const pool = this.pools.get(provider)
    if (!pool) return
    pool.states = new Map(pool.keys.map((k) => [k, emptyState()]))
  }

  removeProvider(provider: string): boolean {
    if (!this.pools.has(provider)) return false
    this.pools.delete(provider)
    this.persist()
    return true
  }

  publicView(provider: string): PoolPublicView | undefined {
    const pool = this.pools.get(provider)
    if (!pool) return undefined
    return {
      apiKeyEnv: pool.env,
      maskedKeys: pool.keys.map(maskKey),
      keyCount: pool.keys.length,
      mode: this.modes.get(provider) || 'auto',
      states: Object.fromEntries([...pool.states].map(([k, s]) => [maskKey(k), { ...s }])),
    }
  }

  dispose(): void {
    this.lifetime.abort()
    for (const t of this.probeTimers.values()) clearTimeout(t)
    this.probeTimers.clear()
    this.inflight.clear()
  }
}
