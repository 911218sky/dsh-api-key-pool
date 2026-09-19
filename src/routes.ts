import type { IncomingMessage, ServerResponse } from 'node:http'
import type { KeyPoolManager } from './pool.js'
import {
  API_BASE,
  DEFAULT_COOLDOWN_MS,
  type PluginConfig,
  type PluginContextWithEvents,
  type PoolPublicView,
  type VerifyAttempt,
} from './types.js'
import {
  asPoolsPostBody,
  asVerifyPostBody,
  assertSafeApiKeyEnv,
  assertSafePublicBaseURL,
  classifyVerifyStatus,
  discoverProvidersFromSettings,
  errorMessage,
  isRequestAuthorized,
  maskKey,
  readJsonBody,
  sendJson,
} from './util.js'

export function registerRoutes(
  ctx: PluginContextWithEvents,
  manager: KeyPoolManager,
  config: PluginConfig = {},
): void {
  const requireAuth = config.requireAuthForMutations !== false
  if (!requireAuth) {
    // Loud footgun warning when admin API is open on non-loopback.
    try {
      ctx.logger?.warn?.(
        '[api-key-pool] requireAuthForMutations=false — pool admin routes are open to the network',
      )
    } catch {
      // ignore
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${API_BASE}/llm-providers`,
        handler: async (req, res) => {
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          if (requireAuth && !isRequestAuthorized(req)) {
            sendJson(res, 401, { error: 'unauthorized' })
            return
          }
          sendJson(res, 200, { providers: discoverProvidersFromSettings(ctx) })
        },
      }),
    'api-key-pool: llm-providers',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${API_BASE}/pools`,
        handler: (req, res) => {
          void handlePools(req, res, manager, ctx, requireAuth)
        },
      }),
    'api-key-pool: pools',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${API_BASE}/verify`,
        handler: (req, res) => {
          void handleVerify(req, res, manager, requireAuth)
        },
      }),
    'api-key-pool: verify',
  )
}

async function handlePools(
  req: IncomingMessage,
  res: ServerResponse,
  manager: KeyPoolManager,
  ctx: PluginContextWithEvents,
  requireAuth: boolean,
): Promise<void> {
  if (requireAuth && !isRequestAuthorized(req)) {
    sendJson(res, 401, { error: 'unauthorized' })
    return
  }

  if (req.method === 'GET') {
    const pools: Record<string, PoolPublicView | undefined> = {}
    for (const name of manager.pools.keys()) {
      pools[name] = manager.publicView(name)
    }
    sendJson(res, 200, {
      pools,
      defaultCooldownMs: DEFAULT_COOLDOWN_MS,
      providers: discoverProvidersFromSettings(ctx),
    })
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }

  const body = asPoolsPostBody(await readJsonBody(req))
  const provider = body.provider ?? ''
  const action = body.action ?? ''

  if (action === 'addProvider') {
    if (!provider) {
      sendJson(res, 400, { error: 'provider name required' })
      return
    }
    if (manager.pools.has(provider)) {
      sendJson(res, 409, { error: `provider '${provider}' already exists` })
      return
    }
    if (body.apiKeyEnv) {
      try {
        assertSafeApiKeyEnv(body.apiKeyEnv)
      } catch (err: unknown) {
        sendJson(res, 400, { error: errorMessage(err) })
        return
      }
    }
    const pool = manager.ensurePool(provider, body.apiKeyEnv, body.key)
    manager.persist()
    sendJson(res, 200, {
      ok: true,
      pool: { provider, apiKeyEnv: pool.env, keyCount: pool.keys.length },
    })
    return
  }

  if (action === 'removeProvider') {
    if (!manager.removeProvider(provider)) {
      sendJson(res, 404, { error: `no pool for '${provider}'` })
      return
    }
    sendJson(res, 200, { ok: true })
    return
  }

  if (!provider || !manager.pools.has(provider)) {
    sendJson(res, 404, { error: `no pool for '${provider}'` })
    return
  }

  if (action === 'add' && body.key) {
    manager.addKey(provider, body.key)
    sendJson(res, 200, { ok: true, count: manager.pools.get(provider)!.keys.length })
    return
  }

  if (action === 'remove') {
    const index = body.index
    if (index === undefined || !Number.isInteger(index)) {
      sendJson(res, 400, { error: 'index required' })
      return
    }
    if (!manager.removeKeyAt(provider, index)) {
      sendJson(res, 404, { error: 'key index out of range' })
      return
    }
    sendJson(res, 200, { ok: true, count: manager.pools.get(provider)!.keys.length })
    return
  }

  if (action === 'update' && Array.isArray(body.keys)) {
    manager.updateKeys(provider, body.keys)
    sendJson(res, 200, { ok: true, count: manager.pools.get(provider)!.keys.length })
    return
  }

  if (action === 'reset') {
    manager.resetCooldown(provider)
    sendJson(res, 200, { ok: true })
    return
  }

  sendJson(res, 400, { error: `unknown action '${action}'` })
}

async function handleVerify(
  req: IncomingMessage,
  res: ServerResponse,
  manager: KeyPoolManager,
  requireAuth: boolean,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }

  if (requireAuth && !isRequestAuthorized(req)) {
    sendJson(res, 401, { error: 'unauthorized' })
    return
  }

  const body = asVerifyPostBody(await readJsonBody(req))
  const provider = body.provider ?? ''
  const baseURL = (body.baseURL ?? '').replace(/\/$/, '')
  const maxAttempts = Math.min(body.maxAttempts || 4, 8)

  if (!provider || !manager.pools.has(provider)) {
    sendJson(res, 404, { error: `no pool for '${provider}'` })
    return
  }
  if (!baseURL) {
    sendJson(res, 400, { error: 'baseURL required' })
    return
  }

  try {
    await assertSafePublicBaseURL(baseURL)
  } catch (err: unknown) {
    sendJson(res, 400, { error: errorMessage(err) })
    return
  }

  // Snapshot keys for probe so we do not permanently scramble live cooldown/idx
  // beyond marking failures that are still useful signal.
  const savedIdx = manager.pools.get(provider)!.idx
  manager.resetCooldown(provider)
  manager.pools.get(provider)!.idx = 0

  const attempts: VerifyAttempt[] = []
  let ok = false

  for (let i = 0; i < maxAttempts; i++) {
    const key = manager.pickKey(provider)
    if (!key) {
      attempts.push({ attempt: i + 1, error: 'no healthy key' })
      break
    }
    manager.applyKeyToEnv(provider, key)

    let status = 0
    let errClass = ''
    try {
      const r = await fetch(`${baseURL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      })
      status = r.status
      // Drain body without returning upstream content (SSRF / info leak).
      await r.arrayBuffer().catch(() => undefined)
      errClass = classifyVerifyStatus(status)
    } catch (err: unknown) {
      status = 0
      const msg = errorMessage(err).toLowerCase()
      errClass = /redirect/i.test(msg) ? 'redirect_blocked' : 'network'
    }

    attempts.push({
      attempt: i + 1,
      key: maskKey(key),
      status,
      error: status >= 200 && status < 300 ? undefined : errClass,
    })

    if (status >= 200 && status < 300) {
      manager.markSuccess(provider, key)
      ok = true
      break
    }
    manager.markFailed(provider, key, String(status || 'TRANSPORT'))
  }

  // Restore round-robin cursor; leave cooldown from probe as diagnostic signal.
  manager.pools.get(provider)!.idx = savedIdx

  sendJson(res, 200, {
    ok,
    provider,
    baseURL,
    attempts,
    states: manager.publicView(provider)?.states || {},
  })
}
