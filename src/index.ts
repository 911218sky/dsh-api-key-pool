import { KeyPoolManager } from './pool.js'
import { registerRoutes } from './routes.js'
import { RETRYABLE_CODES } from './types.js'
import type { PluginConfig, PluginContext } from './types.js'
import { isRetryableFailure, log, maskKey } from './util.js'

export const name = 'api-key-pool'
export const inject = ['llm', 'webServer']

export function apply(ctx: PluginContext, config: PluginConfig = {}): void {
  const manager = new KeyPoolManager(ctx, config)

  ctx.on('agent/request', async (_payload: unknown, next: () => Promise<any>) => {
    const call = await next()
    const provider = call?.provider as string | undefined
    if (!provider) return call

    const key = manager.pickKey(provider)
    if (!key) return call

    return manager.withEnvSerial(provider, () => {
      manager.applyKeyToEnv(provider, key)
      log(ctx, 'info', `injected key ${maskKey(key)} for '${provider}'`)
      return call
    })
  })

  ctx.on('agent/request-error', async (payload: any, next: () => Promise<any>) => {
    const code = String(payload?.failure?.code || payload?.code || '')
    const rawMsg = String(payload?.failure?.message || payload?.message || '')
    const provider = payload?.provider as string | undefined

    const retryable =
      RETRYABLE_CODES.has(code) || isRetryableFailure(code, rawMsg)

    if (provider && retryable) {
      const pool = manager.pools.get(provider)
      if (pool) {
        const currentKey = process.env[pool.env]
        if (currentKey && pool.keys.includes(currentKey)) {
          manager.markFailed(provider, currentKey, code)
          log(ctx, 'info', `key ${maskKey(currentKey)} failed (${code}), retrying with next key...`)
        }
      }
      return { kind: 'retry' }
    }

    return next()
  })

  registerRoutes(ctx, manager)

  ctx.effect(() => () => manager.dispose(), 'api-key-pool: dispose')
}

export { maskKey }
