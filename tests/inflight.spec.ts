import { describe, expect, it, vi } from 'vitest'
import { KeyPoolManager } from '../src/pool.ts'
import type { PluginContextWithEvents } from '../src/types.ts'

function mockCtx(): PluginContextWithEvents {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    on: vi.fn(),
    effect: vi.fn((fn: () => () => void) => fn()),
    get: vi.fn(),
  } as unknown as PluginContextWithEvents
}

describe('KeyPoolManager inflight by turnId', () => {
  it('attributes failure to the matching turn, not a concurrent sibling', () => {
    const manager = new KeyPoolManager(mockCtx(), {
      pools: {
        p: { apiKeyEnv: 'P_API_KEY', keys: ['key-aaa-1111', 'key-bbb-2222'], cooldownMs: 1000 },
      },
    })

    manager.bindInflight('p', 'sess:turn-1', 'key-aaa-1111')
    manager.bindInflight('p', 'sess:turn-2', 'key-bbb-2222')

    expect(manager.takeInflightKey('p', 'sess:turn-1')).toBe('key-aaa-1111')
    manager.markFailed('p', 'key-aaa-1111', 'AUTH')

    // Sibling binding untouched
    expect(manager.takeInflightKey('p', 'sess:turn-2')).toBe('key-bbb-2222')

    const pool = manager.pools.get('p')!
    expect(pool.states.get('key-aaa-1111')!.cooldownUntil).toBeGreaterThan(Date.now())
    expect(pool.states.get('key-bbb-2222')!.cooldownUntil).toBe(0)

    manager.dispose()
  })

  it('clearInflight(provider, turnId) only drops that turn', () => {
    const manager = new KeyPoolManager(mockCtx(), {
      pools: {
        p: { apiKeyEnv: 'P_API_KEY', keys: ['key-aaa-1111', 'key-bbb-2222'] },
      },
    })
    manager.bindInflight('p', 'a:turn-1', 'key-aaa-1111')
    manager.bindInflight('p', 'a:turn-2', 'key-bbb-2222')
    manager.clearInflight('p', 'a:turn-1')
    expect(manager.takeInflightKey('p', 'a:turn-1')).toBeUndefined()
    expect(manager.takeInflightKey('p', 'a:turn-2')).toBe('key-bbb-2222')
    manager.dispose()
  })

  it('hasInflight is true while any turn is bound', () => {
    const manager = new KeyPoolManager(mockCtx(), {
      pools: { p: { apiKeyEnv: 'P_API_KEY', keys: ['key-aaa-1111'] } },
    })
    expect(manager.hasInflight('p')).toBe(false)
    manager.bindInflight('p', 't1', 'key-aaa-1111')
    expect(manager.hasInflight('p')).toBe(true)
    manager.takeInflightKey('p', 't1')
    expect(manager.hasInflight('p')).toBe(false)
    manager.dispose()
  })
})
