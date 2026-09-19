import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  KeyState,
  PersistedPools,
  PluginConfig,
  PluginContext,
  PoolConfigEntry,
  PoolPublicView,
  PoolRuntime,
} from './types.js'
import { DEFAULT_COOLDOWN_MS } from './types.js'
import { discoverProvidersFromSettings, log, maskKey } from './util.js'

const CONFIG_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'pool-config.json')

function emptyState(): KeyState {
  return { failCount: 0, cooldownUntil: 0 }
}

function readPersisted(): PersistedPools {
  try {
    if (!existsSync(CONFIG_FILE)) return {}
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as PersistedPools
  } catch {
    return {}
  }
}

export class KeyPoolManager {
  readonly pools = new Map<string, PoolRuntime>()
  readonly modes = new Map<string, string>()
  private readonly probeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly envQueues = new Map<string, Promise<unknown>>()
  private readonly lifetime = new AbortController()
  private readonly defaultCooldownMs: number
  private readonly ctx: PluginContext

  constructor(ctx: PluginContext, config: PluginConfig = {}) {
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
        keys: entry.keys ?? cur.keys ?? [],
        cooldownMs: cur.cooldownMs,
      }
    }

    const names = new Set([
      ...Object.keys(merged),
      ...discoverProvidersFromSettings(this.ctx),
    ])

    for (const provider of names) {
      const pcfg = merged[provider] || {}
      const env = pcfg.apiKeyEnv || `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`
      const fromCfg = Array.isArray(pcfg.keys) ? pcfg.keys.filter(Boolean) : []
      const fromEnv =
        process.env[env] && process.env[env] !== 'public' ? [process.env[env]!] : []
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
      mkdirSync(dirname(CONFIG_FILE), { recursive: true })
      const out: PersistedPools = { pools: {} }
      for (const [provider, pool] of this.pools) {
        out.pools![provider] = { apiKeyEnv: pool.env, keys: pool.keys }
      }
      writeFileSync(CONFIG_FILE, JSON.stringify(out, null, 2), 'utf8')
    } catch (e: any) {
      log(this.ctx, 'warn', `persist failed: ${e?.message || e}`)
    }
  }

  pickKey(provider: string): string | undefined {
    const pool = this.pools.get(provider)
    if (!pool || pool.keys.length === 0) return undefined

    const now = Date.now()
    const live = pool.keys.filter((k) => (pool.states.get(k)?.cooldownUntil || 0) <= now)
    if (live.length === 0) {
      log(this.ctx, 'warn', `pool '${provider}': all keys cooling`)
      return pool.keys[pool.idx % pool.keys.length]
    }

    for (let i = 0; i < live.length; i++) {
      const key = live[(pool.idx + i) % live.length]!
      const realIdx = pool.keys.indexOf(key)
      if (realIdx >= 0) {
        pool.idx = (realIdx + 1) % pool.keys.length
        return key
      }
    }
    return pool.keys[0]
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

  markFailed(provider: string, key: string, reason: string): void {
    const pool = this.pools.get(provider)
    if (!pool || !key) return
    const st = pool.states.get(key)
    if (!st) return

    st.failCount += 1
    const backoff = pool.cooldown * Math.min(st.failCount, 5)
    st.cooldownUntil = Date.now() + backoff
    log(this.ctx, 'warn', `key ${maskKey(key)} for '${provider}' failed (${reason}), cooldown ${backoff}ms`)

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
    process.env[pool.env] = key
  }

  withEnvSerial<T>(provider: string, fn: () => T | Promise<T>): Promise<T> {
    const prev = this.envQueues.get(provider) || Promise.resolve()
    const next = prev.then(fn, fn) as Promise<T>
    this.envQueues.set(provider, next)
    return next
  }

  ensurePool(provider: string, apiKeyEnv?: string, firstKey?: string): PoolRuntime {
    let pool = this.pools.get(provider)
    if (!pool) {
      const env = apiKeyEnv || `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`
      const keys = firstKey ? [firstKey] : []
      pool = {
        env,
        keys,
        cooldown: this.defaultCooldownMs,
        idx: 0,
        states: new Map(keys.map((k) => [k, emptyState()])),
      }
      this.pools.set(provider, pool)
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
      states: Object.fromEntries(
        [...pool.states].map(([k, s]) => [maskKey(k), { ...s }]),
      ),
    }
  }

  dispose(): void {
    this.lifetime.abort()
    for (const t of this.probeTimers.values()) clearTimeout(t)
    this.probeTimers.clear()
  }
}
