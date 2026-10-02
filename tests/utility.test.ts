import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { runProbe } from '../src/utility/probe'
import { runSqliteSmoke } from '../src/utility/sqlite-smoke'

afterEach(() => vi.useRealTimers())
describe('utility operations', () => {
  it('performs finite asynchronous batches', async () => {
    vi.useFakeTimers()
    const pending = runProbe(
      { requestId: randomUUID(), steps: 3, stepDelayMs: 10 },
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(30)
    await expect(pending).resolves.toEqual({ completedSteps: 3 })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cancels between batches and never resolves success later', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const pending = runProbe(
      { requestId: randomUUID(), steps: 3, stepDelayMs: 10 },
      controller.signal,
    ).catch((error) => error.code)
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()
    expect(await pending).toBe('CANCELLED')
    await vi.advanceTimersByTimeAsync(100)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('rejects an already cancelled signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      runProbe({ requestId: randomUUID(), steps: 1, stepDelayMs: 1 }, controller.signal),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
  })
  it('writes and reads Unicode and integer text then removes its temporary database', async () => {
    await expect(runSqliteSmoke()).resolves.toMatchObject({
      rows: 2,
      unicode: '基础设施🙂',
      integerText: '16752756560315677817',
      cleaned: true,
    })
  })
})
