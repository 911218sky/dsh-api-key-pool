import { describe, expect, it, vi } from 'vitest'
import { KeyPoolManager, uniqueMaskedKeys } from '../src/pool.ts'
import { maskKey } from '../src/util.ts'
import type { PluginContextWithEvents } from '../src/types.ts'

describe('uniqueMaskedKeys', () => {
  it('appends #n when maskKey collides', () => {
    // Same first 2 + last 4 → identical maskKey
    const a = 'abXXXXXXXXXXXwxyz'
    const b = 'abYYYYYYYYYYYwxyz'
    expect(maskKey(a)).toBe(maskKey(b))
    expect(uniqueMaskedKeys([a, b])).toEqual([maskKey(a), `${maskKey(b)}#2`])
  })
})

describe('publicView states', () => {
  it('keeps distinct state entries for colliding masks', () => {
    const a = 'abXXXXXXXXXXXwxyz'
    const b = 'abYYYYYYYYYYYwxyz'
    const manager = new KeyPoolManager(
      {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        on: vi.fn(),
        effect: vi.fn((fn: () => () => void) => fn()),
        get: vi.fn(),
      } as unknown as PluginContextWithEvents,
      { pools: { p: { apiKeyEnv: 'P_API_KEY', keys: [a, b], cooldownMs: 5000 } } },
    )
    manager.markFailed('p', a, 'AUTH')
    const view = manager.publicView('p')!
    expect(view.maskedKeys).toEqual([maskKey(a), `${maskKey(b)}#2`])
    expect(view.states[view.maskedKeys[0]!]!.cooldownUntil).toBeGreaterThan(Date.now())
    expect(view.states[view.maskedKeys[1]!]!.cooldownUntil).toBe(0)
    manager.dispose()
  })
})
