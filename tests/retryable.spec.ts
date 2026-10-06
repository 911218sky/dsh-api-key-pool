import { describe, expect, it } from 'vitest'
import { EMPTY_RESPONSE_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import { RETRYABLE_CODES, isRetryableFailure } from '../src/util.ts'

describe('RETRYABLE_CODES', () => {
  it('includes DSH default transient codes plus key-pool extras', () => {
    expect(RETRYABLE_CODES.has(EMPTY_RESPONSE_CODE)).toBe(true)
    expect(RETRYABLE_CODES.has('RATE_LIMIT')).toBe(true)
    expect(RETRYABLE_CODES.has('SERVER')).toBe(true)
    expect(RETRYABLE_CODES.has('AUTH')).toBe(true)
    expect(RETRYABLE_CODES.has(QUOTA_EXCEEDED_CODE)).toBe(true)
    expect(RETRYABLE_CODES.has('INVALID_CREDENTIAL')).toBe(true)
  })
})

describe('isRetryableFailure', () => {
  it('matches known codes without parsing messages', () => {
    expect(isRetryableFailure('AUTH', '')).toBe(true)
    expect(isRetryableFailure('RATE_LIMIT', '')).toBe(true)
    expect(isRetryableFailure('CONTEXT_WINDOW_EXCEEDED', '')).toBe(false)
  })
})
