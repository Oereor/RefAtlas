import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  bounded,
  LIMITS,
  validId,
  validProbe,
  validRequest,
  validResult,
} from '../src/shared/protocol'

const input = () => ({ requestId: randomUUID(), steps: 1, stepDelayMs: 1 })
describe('foundation protocol boundaries', () => {
  it('accepts exact lower and upper probe limits', () => {
    expect(validProbe(input())).toBe(true)
    expect(validProbe({ ...input(), steps: LIMITS.steps, stepDelayMs: 10 })).toBe(true)
    expect(validProbe({ ...input(), stepDelayMs: LIMITS.durationMs })).toBe(true)
  })
  it.each([
    { steps: 0 },
    { steps: 1001 },
    { steps: 1.5 },
    { steps: NaN },
    { steps: Infinity },
    { steps: '1' },
    { stepDelayMs: 0 },
    { stepDelayMs: 10001 },
    { steps: 1000, stepDelayMs: 11 },
    { extra: true },
    { requestId: 'not-a-uuid' },
  ])('rejects invalid input %j', (replacement) => {
    expect(validProbe({ ...input(), ...replacement })).toBe(false)
  })
  it('rejects null, arrays, absent fields and ID mismatches', () => {
    expect(validProbe(null)).toBe(false)
    expect(validProbe([])).toBe(false)
    expect(validProbe({ requestId: randomUUID() })).toBe(false)
    const probeInput = input()
    const request = {
      type: 'request',
      id: probeInput.requestId,
      operation: 'probe',
      input: probeInput,
    }
    expect(validRequest(request)).toBe(true)
    expect(validRequest({ ...request, id: randomUUID() })).toBe(false)
    expect(validRequest({ ...request, extra: true })).toBe(false)
    expect(validId('x'.repeat(20000))).toBe(false)
  })
  it('validates response value and error shapes', () => {
    expect(validResult({ ok: true, value: { completedSteps: 1 } }, 'probe')).toBe(true)
    expect(validResult({ ok: true, value: { completedSteps: 0 } }, 'probe')).toBe(false)
    expect(
      validResult({ ok: false, error: { code: 'CANCELLED', message: 'cancelled' } }, 'probe'),
    ).toBe(true)
    expect(
      validResult({ ok: false, error: { code: 'arbitrary', message: 'error' } }, 'probe'),
    ).toBe(false)
    expect(validResult({ ok: true, value: { accepted: true, extra: 1 } }, 'cancel')).toBe(false)
  })
  it('caps UTF-8 payloads and rejects unrepresentable values', () => {
    expect(bounded({ payload: 'x'.repeat(LIMITS.bytes) })).toBe(false)
    expect(bounded({ payload: '🙂'.repeat(LIMITS.bytes / 4) })).toBe(false)
    expect(bounded({ payload: 'ok' })).toBe(true)
    expect(bounded({ integer: 123n })).toBe(false)
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(bounded(circular)).toBe(false)
  })
})
