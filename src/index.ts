import { KeyPoolManager } from './pool.js'
import { registerRoutes } from './routes.js'
import {
  DEFAULT_MAX_RETRIES_PER_TURN,
  type AgentRequestErrorPayload,
  type AgentRequestPayload,
  type PluginConfig,
  type PluginContextWithEvents,
} from './types.js'
import { isRetryableFailure, log, maskKey, turnIdFromPayload } from './util.js'

export const name = 'api-key-pool'
export const inject = ['llm', 'webServer', 'settings', 'credentials'] as const

export function apply(ctx: PluginContextWithEvents, config: PluginConfig = {}): void {
  // Register settings namespace (pairs with client settings.section / future schema).
  // Pool data lives in pool-config.json / REST; empty schema is enough.
  ctx.inject(['settings'], async (sctx) => {
    try {
      // Lazy import avoids a Node require(ESM) race with parallel plugin entry loading.
      const schemastery = await import('@deepseek-ai/schemastery')
      const zs = schemastery.default ?? schemastery
      const scope = sctx.settings.register('api-key-pool', zs.object({}), { base: {} })
      sctx.effect(() => () => {
        void scope
      }, 'api-key-pool: settings namespace')
      log(ctx, 'info', 'settings namespace api-key-pool registered')
    } catch (err: unknown) {
      log(
        ctx,
        'error',
        `settings.register(api-key-pool) failed — Settings section may stay hidden: ${String(
          err instanceof Error ? err.message : err,
        )}`,
      )
    }
  })

  // DSH treats non-loopback pages as settings-unavailable (memory persistence).
  // When browsing via --trusted-host, mark the page as owning the host so
  // Settings → Models can load the provider directory.
  if (config.enableRemoteHostSettings !== false) {
    ctx.on('webserver/index-inject', (table) => {
      table.push({
        kind: 'script',
        placement: 'head',
        // Merge ownsHost without clobbering an existing Electron/custom transport.
        text: '(function(){var t=globalThis.__DSH_TRANSPORT__;globalThis.__DSH_TRANSPORT__=Object.assign({},t&&typeof t==="object"?t:{},{ownsHost:true});})();',
      })
    })
    log(ctx, 'info', 'remote host settings enabled (__DSH_TRANSPORT__.ownsHost)')
  }

  const manager = new KeyPoolManager(ctx, config)
  const maxRetries = config.maxRetriesPerTurn ?? DEFAULT_MAX_RETRIES_PER_TURN
  const turnRetries = new Map<string, number>()

  // llm/stream is a global waterfall (third-party plugins often miss scoped agent/request).
  ctx.on(
    'llm/stream',
    async (options, next) => {
      const provider = options?.provider
      if (!provider) return next()
      const key = manager.pickKey(provider)
      if (!key) return next()
      await manager.applyKeyToEnv(provider, key)
      log(ctx, 'info', `llm/stream: rotated key ${maskKey(key)} for '${provider}'`)
      return next()
    },
    { global: true },
  )

  ctx.on('agent/request', async (payload: AgentRequestPayload, next) => {
    const call = await next()
    const provider = call.provider
    if (!provider) return call

    const turnId = turnIdFromPayload(payload)
    const retriesSoFar = turnRetries.get(turnId) || 0
    const isRetry = retriesSoFar > 0

    if (!isRetry) {
      // Previous turn's key for this provider likely succeeded if we start fresh.
      manager.markPreviousSuccess(provider)
      manager.clearInflight(provider)
    }

    const key = manager.pickKey(provider)
    if (!key) return call

    return manager.withEnvSerial(provider, async () => {
      await manager.applyKeyToEnv(provider, key)
      manager.applyKeyToCallConfig(call, key)
      manager.bindInflight(provider, key)
      log(
        ctx,
        'info',
        `injected key ${maskKey(key)} for '${provider}'${isRetry ? ` (retry ${retriesSoFar})` : ''}`,
      )
      return call
    })
  })

  ctx.on('agent/request-error', async (payload: AgentRequestErrorPayload, next) => {
    const code = String(payload.failure?.code ?? payload.code ?? '')
    const rawMsg = String(payload.failure?.message ?? payload.message ?? '')
    const provider = payload.provider
    const turnId = turnIdFromPayload(payload)

    const retryable = isRetryableFailure(code, rawMsg)
    if (!provider || !retryable) {
      return next()
    }

    const boundKey = manager.takeInflightKey(provider)
    if (boundKey) {
      manager.markFailed(provider, boundKey, code)
      log(ctx, 'info', `key ${maskKey(boundKey)} failed (${code})`)
    }

    const used = (turnRetries.get(turnId) || 0) + 1
    turnRetries.set(turnId, used)

    if (used > maxRetries) {
      log(ctx, 'warn', `turn ${turnId}: max key retries (${maxRetries}) reached — stop rotating`)
      return next()
    }

    if (!manager.hasHealthyKey(provider)) {
      log(ctx, 'warn', `pool '${provider}': no healthy keys left — stop rotating`)
      return next()
    }

    log(ctx, 'info', `retrying '${provider}' with next key (attempt ${used}/${maxRetries})`)
    return { kind: 'retry' as const }
  })

  registerRoutes(ctx, manager, config)

  ctx.effect(() => () => manager.dispose(), 'api-key-pool: dispose')
}

export { maskKey }
export {
  assertSafeApiKeyEnv,
  assertSafePublicBaseURL,
  isRequestAuthorized,
  isMutationAllowed,
} from './util.js'
