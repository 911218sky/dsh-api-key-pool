import { describe, expect, it, vi } from 'vitest'
import { KeyPoolManager } from '../src/pool.ts'
import type { PluginContextWithEvents } from '../src/types.ts'

function managerWith(keys: string[]) {
  return new KeyPoolManager(
    {
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      on: vi.fn(),
      effect: vi.fn((fn: () => () => void) => fn()),
      get: vi.fn((name: string) =>
        name === 'credentials' ? { set: vi.fn(async () => undefined) } : undefined,
      ),
    } as unknown as PluginContextWithEvents,
    { pools: { p: { apiKeyEnv: 'P_API_KEY', keys } } },
  )
}

describe('withKeyOnCallConfig (DSH 0.2 deepFreeze)', () => {
  it('returns a new object instead of mutating a frozen seed', () => {
    const manager = managerWith(['sk-frozen-aaaa'])
    const seed = Object.freeze({
      provider: 'p',
      model: 'm',
      headers: Object.freeze({ 'x-test': '1' }),
    })

    const key = manager.pickKey('p')!
    const stamped = manager.withKeyOnCallConfig(seed, key)

    expect(stamped).not.toBe(seed)
    expect(stamped.apiKey).toBe('sk-frozen-aaaa')
    expect(stamped.authorization).toBe('Bearer sk-frozen-aaaa')
    expect(stamped.headers.Authorization).toBe('Bearer sk-frozen-aaaa')
    expect(stamped.headers['x-test']).toBe('1')
    expect(Object.isFrozen(seed)).toBe(true)
    expect((seed as { apiKey?: string }).apiKey).toBeUndefined()
    manager.dispose()
  })

  it('applyKeyToCallConfig no-ops on frozen options without throwing', () => {
    const manager = managerWith(['sk-frozen-bbbb'])
    const options = Object.freeze({ provider: 'p' as string })
    const key = manager.pickKey('p')!

    expect(() => manager.applyKeyToCallConfig(options, key)).not.toThrow()
    expect((options as { apiKey?: string }).apiKey).toBeUndefined()
    manager.dispose()
  })
})
