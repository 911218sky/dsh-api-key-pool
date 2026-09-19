import type { IncomingMessage, ServerResponse } from 'node:http'
import type { KeyPoolManager } from './pool.js'
import { API_BASE, DEFAULT_COOLDOWN_MS } from './types.js'
import type { PluginContext } from './types.js'
import { discoverProvidersFromSettings, maskKey, readJsonBody, sendJson } from './util.js'

export function registerRoutes(ctx: PluginContext, manager: KeyPoolManager): void {
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
        handler: (req, res) => handlePools(req, res, manager, ctx),
      }),
    'api-key-pool: pools',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${API_BASE}/verify`,
        handler: (req, res) => handleVerify(req, res, manager),
      }),
    'api-key-pool: verify',
  )
}

async function handlePools(
  req: IncomingMessage,
  res: ServerResponse,
  manager: KeyPoolManager,
  ctx: PluginContext,
): Promise<void> {
  if (req.method === 'GET') {
    const pools: Record<string, ReturnType<KeyPoolManager['publicView']>> = {}
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

  const body = await readJsonBody(req)
  const provider = String(body.provider || '')
  const action = String(body.action || '')

  if (action === 'addProvider') {
    if (!provider) {
      sendJson(res, 400, { error: 'provider name required' })
      return
    }
    if (manager.pools.has(provider)) {
      sendJson(res, 409, { error: `provider '${provider}' already exists` })
      return
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
    manager.addKey(provider, String(body.key))
    sendJson(res, 200, { ok: true, count: manager.pools.get(provider)!.keys.length })
    return
  }

  if (action === 'remove') {
    const index = Number(body.index)
    if (!Number.isInteger(index)) {
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
    manager.updateKeys(provider, body.keys.map(String))
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
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }

  const body = await readJsonBody(req)
  const provider = String(body.provider || '')
  const baseURL = String(body.baseURL || '').replace(/\/$/, '')
  const maxAttempts = Math.min(Number(body.maxAttempts) || 4, 8)

  if (!provider || !manager.pools.has(provider)) {
    sendJson(res, 404, { error: `no pool for '${provider}'` })
    return
  }
  if (!baseURL) {
    sendJson(res, 400, { error: 'baseURL required' })
    return
  }

  manager.resetCooldown(provider)
  const pool = manager.pools.get(provider)!
  pool.idx = 0

  const attempts: Array<{
    attempt: number
    key?: string
    status?: number
    error?: string
  }> = []
  let ok = false

  for (let i = 0; i < maxAttempts; i++) {
    const key = manager.pickKey(provider)
    if (!key) {
      attempts.push({ attempt: i + 1, error: 'no key' })
      break
    }
    manager.applyKeyToEnv(provider, key)

    let status = 0
    let errMsg = ''
    try {
      const r = await fetch(`${baseURL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(20_000),
      })
      status = r.status
      if (!r.ok) errMsg = (await r.text().catch(() => '')).slice(0, 180)
    } catch (e: any) {
      status = 0
      errMsg = String(e?.message || e).slice(0, 180)
    }

    attempts.push({
      attempt: i + 1,
      key: maskKey(key),
      status,
      error: errMsg || undefined,
    })

    if (status >= 200 && status < 300) {
      manager.markSuccess(provider, key)
      ok = true
      break
    }
    manager.markFailed(provider, key, String(status || 'TRANSPORT'))
  }

  sendJson(res, 200, {
    ok,
    provider,
    baseURL,
    attempts,
    states: manager.publicView(provider)?.states || {},
  })
}
