import { describe, expect, it } from 'vitest'
import { turnIdFromPayload } from '../src/util.ts'

describe('turnIdFromPayload', () => {
  it('scopes numeric turns by agent id', () => {
    expect(turnIdFromPayload({ agent: { id: 'sess-a' }, turn: 3 })).toBe('sess-a:turn-3')
    expect(turnIdFromPayload({ agent: { id: 'sess-b' }, turn: 3 })).toBe('sess-b:turn-3')
  })

  it('falls back when agent is missing', () => {
    expect(turnIdFromPayload({ turn: 1 })).toBe('agent:turn-1')
  })
})
