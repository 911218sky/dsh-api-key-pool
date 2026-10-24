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

describe('KeyPoolManager sticky-until-fail pickKey', () => {
  it('reuses the same key while it stays healthy', () => {
    const manager = new KeyPoolManager(mockCtx(), {
      pools: {
        p: { apiKeyEnv: 'P_API_KEY', keys: ['key-aaa-1111', 'key-bbb-2222', 'key-ccc-3333'], cooldownMs: 60_000 },
      },
    })

    expect(manager.pickKey('p')).toBe('key-aaa-1111')
    expect(manager.pickKey('p')).toBe('key-aaa-1111')
    expect(manager.pickKey('p')).toBe('key-aaa-1111')

    manager.dispose()
  })

  it('advances only after the sticky key is marked failed', () => {
    const manager = new KeyPoolManager(mockCtx(), {
      pools: {
        p: { apiKeyEnv: 'P_API_KEY', keys: ['key-aaa-1111', 'key-bbb-2222'], cooldownMs: 60_000 },
      },
    })

    expect(manager.pickKey('p')).toBe('key-aaa-1111')
    manager.markFailed('p', 'key-aaa-1111', '429')
    expect(manager.pickKey('p')).toBe('key-bbb-2222')
    expect(manager.pickKey('p')).toBe('key-bbb-2222')

    manager.dispose()
  })
})
