import { describe, expect, it, vi } from 'vitest'
import { KeyPoolManager } from '../src/pool.ts'
import type { PluginContextWithEvents } from '../src/types.ts'

describe('withEnvSerial + applyKeyToCallConfig (stream-shaped options)', () => {
  it('stamps call config under the env serial lock', async () => {
    const set = vi.fn(async () => undefined)
    const manager = new KeyPoolManager(
      {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        on: vi.fn(),
        effect: vi.fn((fn: () => () => void) => fn()),
        get: vi.fn((name: string) => (name === 'credentials' ? { set } : undefined)),
      } as unknown as PluginContextWithEvents,
      { pools: { p: { apiKeyEnv: 'P_API_KEY', keys: ['sk-stream-test-key'] } } },
    )

    const options: { provider?: string; apiKey?: string; headers?: Record<string, string> } = {
      provider: 'p',
    }
    const key = manager.pickKey('p')!
    await manager.withEnvSerial('p', async () => {
      await manager.applyKeyToEnv('p', key)
      manager.applyKeyToCallConfig(options, key)
    })

    expect(options.apiKey).toBe('sk-stream-test-key')
    expect(options.headers?.Authorization).toBe('Bearer sk-stream-test-key')
    expect(set).toHaveBeenCalledWith('P_API_KEY', 'sk-stream-test-key')
    manager.dispose()
  })
})
