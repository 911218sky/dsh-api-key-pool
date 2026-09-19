import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LoggerLike, PoolsPostBody, VerifyPostBody } from './types.js'
import { RETRYABLE_CODES } from './types.js'

export interface LogContext {
  logger?: LoggerLike
}

export function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function settingsPath(): string {
  return join(dshHome(), 'settings.yaml')
}

/** Stable path that survives package reinstalls. */
export function poolConfigPath(): string {
  return join(dshHome(), 'storages', 'dsh-api-key-pool', 'pool-config.json')
}

/** Legacy location next to the installed package (migrate-once source). */
export function legacyPoolConfigPath(packageRoot: string): string {
  return join(packageRoot, 'pool-config.json')
}

export function ensureStorageDir(): void {
  mkdirSync(join(dshHome(), 'storages', 'dsh-api-key-pool'), { recursive: true })
}

export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return `${key.slice(0, 2)}****`
  return `${key.slice(0, 6)}****${key.slice(-4)}`
}

export function log(
  ctx: LogContext | null | undefined,
  level: keyof LoggerLike,
  msg: string,
): void {
  try {
    ctx?.logger?.[level]?.(`[api-key-pool] ${msg}`)
  } catch {
    // ignore
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer | string) => {
      body += chunk
      if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        const parsed: unknown = JSON.parse(body || '{}')
        resolve(isPlainObject(parsed) ? parsed : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

export function asPoolsPostBody(raw: Record<string, unknown>): PoolsPostBody {
  const keysRaw = raw.keys
  return {
    action: typeof raw.action === 'string' ? raw.action : undefined,
    provider: typeof raw.provider === 'string' ? raw.provider : undefined,
    apiKeyEnv: typeof raw.apiKeyEnv === 'string' ? raw.apiKeyEnv : undefined,
    key: typeof raw.key === 'string' ? raw.key : undefined,
    keys: Array.isArray(keysRaw) ? keysRaw.map(String) : undefined,
    index:
      typeof raw.index === 'number'
        ? raw.index
        : raw.index !== undefined
          ? Number(raw.index)
          : undefined,
  }
}

export function asVerifyPostBody(raw: Record<string, unknown>): VerifyPostBody {
  return {
    provider: typeof raw.provider === 'string' ? raw.provider : undefined,
    baseURL: typeof raw.baseURL === 'string' ? raw.baseURL : undefined,
    maxAttempts:
      typeof raw.maxAttempts === 'number'
        ? raw.maxAttempts
        : raw.maxAttempts !== undefined
          ? Number(raw.maxAttempts)
          : undefined,
  }
}

export function sendJson(res: ServerResponse, code: number, data: unknown): void {
  const payload = JSON.stringify(data)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

/** Loopback or DSH session cookie / bearer — used for mutating admin routes. */
export function isMutationAllowed(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress || ''
  const loopback =
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === ':ffff:127.0.0.1' ||
    addr.endsWith('127.0.0.1')
  if (loopback) return true

  const cookie = String(req.headers.cookie || '')
  if (/dsh-auth-[^=]+=/.test(cookie)) return true
  if (req.headers.authorization) return true

  const token = process.env.DSH_API_KEY_POOL_TOKEN
  if (token && req.headers['x-api-key-pool-token'] === token) return true

  return false
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return true
  }
  if (host.endsWith('.local') || host.endsWith('.internal')) return true

  // IPv4 private / link-local / CGNAT
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
  }
  // IPv6 unique-local / link-local
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true
  return false
}

/**
 * Reject non-http(s) and private/local targets for server-side verify fetches (SSRF).
 */
export function assertSafePublicBaseURL(baseURL: string): void {
  let url: URL
  try {
    url = new URL(baseURL)
  } catch {
    throw new Error('invalid baseURL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('baseURL must be http(s)')
  }
  if (url.username || url.password) {
    throw new Error('baseURL must not include credentials')
  }
  if (isPrivateOrLocalHostname(url.hostname)) {
    throw new Error('baseURL must not target private/loopback hosts')
  }
}

/** Extract provider ids under any `providers:` block (settings.yaml / cordis.patch.yml). */
export function extractProvidersFromText(raw: string): string[] {
  const names: string[] = []
  let inProviders = false
  let providersIndent = 0
  for (const line of raw.split('\n')) {
    const prov = /^(\s*)providers:\s*$/.exec(line)
    if (prov) {
      inProviders = true
      providersIndent = prov[1].length
      continue
    }
    if (!inProviders) continue

    const m = /^(\s*)([A-Za-z0-9_-]+):\s*(?:#.*)?$/.exec(line)
    if (!m) {
      if (line.trim() === '' || line.trim().startsWith('#')) continue
      const indent = /^(\s*)/.exec(line)?.[1].length ?? 0
      if (indent <= providersIndent) inProviders = false
      continue
    }
    const indent = m[1].length
    const key = m[2]
    if (indent <= providersIndent) {
      inProviders = false
      continue
    }
    // direct children of providers: exactly +2 or +4 spaces (yaml variants)
    if (indent === providersIndent + 2 || indent === providersIndent + 4) {
      const skip = new Set([
        'displayName',
        'apiKeyEnv',
        'api',
        'baseURL',
        'models',
        'compat',
        'retryPolicy',
        'defaultInput',
        'cacheRetention',
        'streamIdleTimeoutMs',
        'config',
      ])
      if (!skip.has(key)) names.push(key)
    } else if (indent > providersIndent + 4) {
      // nested fields — ignore
    }
  }
  return names
}

function providersFromSettingsDescribe(ctx?: LogContext | null): string[] {
  try {
    const settingsSvc = ctx && 'get' in ctx && typeof (ctx as { get?: unknown }).get === 'function'
      ? (ctx as { get: (name: string) => unknown }).get('settings')
      : undefined
    const describe = (settingsSvc as { describe?: (opts?: { redactSecrets?: boolean }) => unknown } | undefined)
      ?.describe
    if (typeof describe !== 'function') return []

    const descs = describe.call(settingsSvc, { redactSecrets: true })
    // Host describe is sync in current DSH; ignore Promise-shaped answers here.
    if (!Array.isArray(descs)) return []
    for (const row of descs) {
      if (!row || typeof row !== 'object') continue
      const ns = (row as { ns?: unknown }).ns
      if (String(ns) !== 'llm-pi-ai') continue
      const providers = (row as { value?: { providers?: unknown } }).value?.providers
      if (providers && typeof providers === 'object' && !Array.isArray(providers)) {
        return Object.keys(providers as Record<string, unknown>)
      }
    }
  } catch (err: unknown) {
    log(ctx, 'warn', `discoverProviders(settings.describe) failed: ${errorMessage(err)}`)
  }
  return []
}

export function discoverProvidersFromSettings(ctx?: LogContext | null): string[] {
  const fromDescribe = providersFromSettingsDescribe(ctx)
  if (fromDescribe.length > 0) return fromDescribe

  const found = new Set<string>()
  const files = [
    settingsPath(),
    join(dshHome(), 'profiles', 'web', 'cordis.patch.yml'),
    join(dshHome(), 'profiles', 'web', 'cordis.yml'),
  ]
  for (const file of files) {
    try {
      if (!existsSync(file)) continue
      for (const name of extractProvidersFromText(readFileSync(file, 'utf8'))) {
        found.add(name)
      }
    } catch (err: unknown) {
      log(ctx, 'warn', `discoverProviders (${file}) failed: ${errorMessage(err)}`)
    }
  }
  return [...found]
}

/**
 * Only rotate on auth / rate-limit / quota / timeout / transport — not generic 4xx model errors.
 */
export function isRetryableFailure(code: string, message: string): boolean {
  if (RETRYABLE_CODES.has(code)) return true

  const upper = code.toUpperCase()
  if (RETRYABLE_CODES.has(upper)) return true

  const http = Number((code.match(/\d{3}/) || [])[0] || 0)
  if ([401, 403, 429, 502, 503, 504].includes(http)) return true

  return /(?:^|[^\w])(401|403|429)(?:[^\w]|$)|rate\s*limit|too many requests|quota|throttl|unauthorized|forbidden|invalid[_\s-]?api[_\s-]?key|authentication|exhausted|timeout|timed\s*out|econnreset|econnrefused|socket hang up|network/i.test(
    `${code} ${message}`,
  )
}

export function turnIdFromPayload(payload: {
  turn?: { id?: string; turnId?: string }
}): string {
  const t = payload.turn
  if (t?.id) return String(t.id)
  if (t?.turnId) return String(t.turnId)
  return `anon-${Date.now()}`
}
