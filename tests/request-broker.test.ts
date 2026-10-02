import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { LIMITS } from '../src/shared/protocol'
import type { ProbeResult, Request } from '../src/shared/protocol'
import { RequestBroker } from '../src/main/request-broker'

const probe = (requestId: string = randomUUID()): Request => ({
  type: 'request',
  id: requestId,
  operation: 'probe',
  input: { requestId, steps: 1, stepDelayMs: 1 },
})
const success = (request: Request, completedSteps = 1) => ({
  type: 'response',
  id: request.id,
  result: { ok: true, value: { completedSteps } },
})
const harness = (timeoutMs = 1000) => {
  const sent: Request[] = []
  return { sent, broker: new RequestBroker((request) => sent.push(request), timeoutMs) }
}
afterEach(() => vi.useRealTimers())

describe('request broker observable behavior', () => {
  it('matches out-of-order responses and rejects duplicate external IDs', async () => {
    const { broker, sent } = harness()
    const first = probe()
    const firstPending = broker.request<ProbeResult>(first)
    const secondPending = broker.request<ProbeResult>(probe())
    await expect(broker.request(first)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    broker.accept(success(sent[1], 2))
    broker.accept(success(sent[0]))
    await expect(firstPending).resolves.toEqual({ completedSteps: 1 })
    await expect(secondPending).resolves.toEqual({ completedSteps: 2 })
    expect(broker.size).toBe(0)
  })
  it('rejects pending requests on exit and starts fresh after restart', async () => {
    const old = harness()
    const request = probe()
    const invalidated = old.broker.request<ProbeResult>(request)
    old.broker.exit()
    await expect(invalidated).rejects.toMatchObject({ code: 'SERVICE_EXIT' })
    await expect(old.broker.request(probe())).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    const fresh = harness()
    const restored = fresh.broker.request<ProbeResult>(request)
    fresh.broker.accept(success(old.sent[0]))
    expect(fresh.broker.size).toBe(1)
    fresh.broker.accept(success(fresh.sent[0]))
    await expect(restored).resolves.toEqual({ completedSteps: 1 })
  })
  it('accepts cancellation and ignores subsequent success for the cancelled request', async () => {
    const { broker, sent } = harness()
    const request = probe()
    const pending = broker.request<ProbeResult>(request, 7)
    const cancellation = broker.cancel(request.id, 7)
    expect(sent[1].operation).toBe('cancel')
    broker.accept({
      type: 'response',
      id: sent[1].id,
      result: { ok: true, value: { accepted: true } },
    })
    await expect(cancellation).resolves.toEqual({ accepted: true })
    broker.accept({
      type: 'response',
      id: sent[0].id,
      result: { ok: false, error: { code: 'CANCELLED', message: 'cancelled' } },
    })
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    broker.accept(success(sent[0]))
    expect(broker.size).toBe(0)
  })
  it('does not permit another window to cancel an owned task', async () => {
    const { broker, sent } = harness()
    const request = probe()
    const pending = broker.request<ProbeResult>(request, 1)
    await expect(broker.cancel(request.id, 2)).resolves.toEqual({ accepted: false })
    expect(sent).toHaveLength(1)
    broker.accept(success(sent[0]))
    await pending
  })
  it('clears owned requests when their window is destroyed', async () => {
    const { broker, sent } = harness()
    const pending = broker.request<ProbeResult>(probe(), 3)
    broker.rejectOwner(3)
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(sent.at(-1)?.operation).toBe('cancel')
    expect(broker.size).toBe(0)
  })
  it('times out, requests cancellation and cannot match a stale response to a reused external ID', async () => {
    vi.useFakeTimers()
    const { broker, sent } = harness(20)
    const request = probe()
    const expired = broker.request<ProbeResult>(request).catch((error) => error.code)
    await vi.advanceTimersByTimeAsync(20)
    expect(await expired).toBe('TIMEOUT')
    expect(sent[1].operation).toBe('cancel')
    const reused = broker.request<ProbeResult>(request)
    broker.accept(success(sent[0]))
    expect(broker.size).toBe(1)
    broker.accept(success(sent[2]))
    await expect(reused).resolves.toEqual({ completedSteps: 1 })
  })
  it('reserves a control slot so a full task pool can still cancel', async () => {
    const { broker, sent } = harness()
    const requests = Array.from({ length: LIMITS.pending - 1 }, () => probe())
    const pending = requests.map((request) =>
      broker.request<ProbeResult>(request, 1).catch((error) => error.code),
    )
    await expect(broker.request(probe())).rejects.toMatchObject({ code: 'BUSY' })
    const cancellation = broker.cancel(requests[0].id, 1)
    expect(broker.size).toBe(LIMITS.pending)
    broker.accept({
      type: 'response',
      id: sent.at(-1)!.id,
      result: { ok: true, value: { accepted: true } },
    })
    await expect(cancellation).resolves.toEqual({ accepted: true })
    broker.exit()
    await Promise.all(pending)
  })
  it.each([null, { type: 'response', payload: 'x'.repeat(LIMITS.bytes) }])(
    'invalidates the channel after an invalid response (case %#)',
    async (message) => {
      const { broker } = harness()
      const pending = broker.request<ProbeResult>(probe())
      broker.accept(message)
      await expect(pending).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' })
      expect(broker.isAvailable).toBe(false)
    },
  )
  it('rejects a wrong result shape for a matched operation', async () => {
    const { broker, sent } = harness()
    const pending = broker.request<ProbeResult>(probe())
    broker.accept({
      type: 'response',
      id: sent[0].id,
      result: { ok: true, value: { accepted: true } },
    })
    await expect(pending).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' })
  })
  it('settles immediately if transport send fails', async () => {
    const broker = new RequestBroker(() => {
      throw new Error('closed')
    })
    await expect(broker.request(probe())).rejects.toMatchObject({ code: 'SERVICE_EXIT' })
    expect(broker.size).toBe(0)
  })
})
