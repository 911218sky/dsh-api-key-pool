import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
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
  mkdirSync(join(dshHome(), 'storages', 'dsh-api-key-pool'), { recursive: true, mode: 0o700 })
}

export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return `${key.slice(0, 2)}****`
  // Prefer short fingerprint: avoid leaking long stable prefixes.
  return `${key.slice(0, 2)}****${key.slice(-4)}`
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

function timingSafeStringEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.byteLength !== b.byteLength) {
    timingSafeEqual(a, a)
    return false
  }
  return timingSafeEqual(a, b)
}

function knownAuthTokens(): string[] {
  return [
    process.env.DSH_API_KEY_POOL_TOKEN,
    process.env.DSH_WEB_TOKEN,
    process.env.DSH_TOKEN,
    process.env.DSH_BROWSER_LAUNCH_TOKEN,
  ].filter((t): t is string => typeof t === 'string' && t.length > 0)
}

function matchesKnownToken(value: string): boolean {
  return knownAuthTokens().some((token) => timingSafeStringEqual(value, token))
}

export function isLoopbackAddress(addr: string): boolean {
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === ':ffff:127.0.0.1' ||
    addr === '::ffff:127.0.0.1' ||
    addr.endsWith('127.0.0.1')
  )
}

function requestHost(req: IncomingMessage): string | undefined {
  const host = req.headers.host
  if (typeof host !== 'string' || !host) return undefined
  try {
    return new URL(`http://${host}`).host
  } catch {
    return undefined
  }
}

/** Same-origin browser request — used with session-cookie auth. */
export function isSameOriginRequest(req: IncomingMessage): boolean {
  const host = requestHost(req)
  if (!host) return false

  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase()
  if (site === 'same-origin') return true

  const origin = req.headers.origin
  if (typeof origin === 'string' && origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }

  const referer = req.headers.referer
  if (typeof referer === 'string' && referer) {
    try {
      return new URL(referer).host === host
    } catch {
      return false
    }
  }

  // Missing Origin/Referer/Sec-Fetch-Site: reject (blocks forged cookie + bare curl).
  return false
}

function hasStructuredSessionCookie(req: IncomingMessage): boolean {
  const cookie = String(req.headers.cookie || '')
  if (!cookie) return false
  for (const segment of cookie.split(';')) {
    const at = segment.indexOf('=')
    if (at === -1) continue
    const name = segment.slice(0, at).trim()
    const value = segment.slice(at + 1).trim()
    if (!name.startsWith('dsh-auth-')) continue
    // DSH signed cookie: v1.<body>.<sig>
    if (/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return true
  }
  return false
}

/**
 * Authorize admin REST (GET + mutations).
 * - Loopback: trusted local operator.
 * - Bearer / x-api-key-pool-token: must equal a known env token (timing-safe).
 * - Session cookie: structured dsh-auth cookie + same-origin fetch metadata.
 */
export function isRequestAuthorized(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress || ''
  if (isLoopbackAddress(addr)) return true

  const poolHeader = req.headers['x-api-key-pool-token']
  if (typeof poolHeader === 'string' && matchesKnownToken(poolHeader)) return true

  const auth = req.headers.authorization
  if (typeof auth === 'string') {
    const m = /^Bearer\s+(\S+)$/i.exec(auth.trim())
    if (m && matchesKnownToken(m[1])) return true
  }

  if (hasStructuredSessionCookie(req) && isSameOriginRequest(req)) return true

  return false
}

/** @deprecated use {@link isRequestAuthorized} */
export function isMutationAllowed(req: IncomingMessage): boolean {
  return isRequestAuthorized(req)
}

const RESERVED_ENV_NAMES = new Set([
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'PWD',
  'TMP',
  'TEMP',
  'TMPDIR',
  'HOSTNAME',
  'LANG',
  'LC_ALL',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_ENV',
  'OPENSSL_CONF',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
])

/** Restrict apiKeyEnv to safe credential env names. */
export function assertSafeApiKeyEnv(name: string): void {
  if (!/^[A-Z][A-Z0-9_]{0,62}$/.test(name)) {
    throw new Error('apiKeyEnv must be UPPER_SNAKE_CASE')
  }
  if (RESERVED_ENV_NAMES.has(name) || name.startsWith('NODE_') || name.startsWith('npm_')) {
    throw new Error('apiKeyEnv name is reserved')
  }
  if (!/(?:_API_KEY|_TOKEN|_KEY)$/.test(name)) {
    throw new Error('apiKeyEnv must end with _API_KEY, _TOKEN, or _KEY')
  }
}

function normalizeIpLiteral(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

function ipv4MappedToV4(host: string): string | undefined {
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host)
  return m?.[1]
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = normalizeIpLiteral(hostname)
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return true
  }
  if (host === '::' || host === '0:0:0:0:0:0:0:0' || host === '0:0:0:0:0:0:0:1') return true
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return true
  }

  const mapped = ipv4MappedToV4(host)
  if (mapped) return isPrivateOrLocalHostname(mapped)

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

  // IPv6 unique-local / link-local / loopback / unspecified / IPv4-mapped prefix
  if (
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80') ||
    host === '::1' ||
    host.startsWith('::ffff:')
  ) {
    return true
  }
  return false
}

function isBlockedResolvedAddress(address: string): boolean {
  return isPrivateOrLocalHostname(address)
}

/**
 * Reject non-http(s) and private/local targets for server-side verify fetches (SSRF).
 * Resolves DNS and rejects private answers; callers must also use `redirect: 'error'`.
 */
export async function assertSafePublicBaseURL(baseURL: string): Promise<void> {
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
  const host = normalizeIpLiteral(url.hostname)
  if (!host) throw new Error('baseURL hostname required')
  if (isPrivateOrLocalHostname(host)) {
    throw new Error('baseURL must not target private/loopback hosts')
  }

  if (isIP(host)) {
    if (isBlockedResolvedAddress(host)) {
      throw new Error('baseURL must not target private/loopback hosts')
    }
    return
  }

  let answers: Array<{ address: string; family: number }>
  try {
    answers = await dnsLookup(host, { all: true, verbatim: true })
  } catch {
    throw new Error('baseURL hostname could not be resolved')
  }
  if (!answers.length) throw new Error('baseURL hostname could not be resolved')
  for (const ans of answers) {
    if (isBlockedResolvedAddress(ans.address)) {
      throw new Error('baseURL resolves to a private/loopback address')
    }
  }
}

/** Map probe HTTP status to a coarse class — never return upstream bodies. */
export function classifyVerifyStatus(status: number): string {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (status === 402) return 'quota'
  if (status >= 500) return 'upstream'
  if (status > 0) return 'rejected'
  return 'network'
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
  // Prefer profile plugin config over legacy settings.yaml (0.1.7 one-time import).
  const files = [
    join(dshHome(), 'profiles', 'web', 'cordis.patch.yml'),
    join(dshHome(), 'profiles', 'web', 'cordis.yml'),
    settingsPath(),
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

/** Stable opaque id for logs (optional helper). */
export function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}
