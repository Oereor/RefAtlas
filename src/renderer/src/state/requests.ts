import type { RawBridge, RawCode, RawResult } from '../../../shared/raw'

export type UiError = { code: RawCode; details?: { limit: string } }
export class RequestFailure extends Error {
  constructor(public readonly error: UiError) {
    super(error.code)
  }
}
export function errorOf(error: unknown): UiError {
  return error instanceof RequestFailure ? error.error : { code: 'INTERNAL' }
}
export async function request<T>(
  bridge: RawBridge,
  signal: AbortSignal,
  call: (requestId: string) => Promise<RawResult<T>>,
  started?: (requestId: string) => void,
): Promise<T> {
  if (signal.aborted) throw new RequestFailure({ code: 'CANCELLED' })
  const id = crypto.randomUUID()
  const cancel = () => {
    void bridge.cancelRequest(id).catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  started?.(id)
  try {
    const result = await call(id)
    if (signal.aborted) throw new RequestFailure({ code: 'CANCELLED' })
    if (!result.ok) throw new RequestFailure(result.error)
    return result.value
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

/** Renderer queue bounds transport work as well as cancelling queued intent. */
export class RequestQueue {
  private running = 0
  private waiting: (() => void)[] = []
  constructor(private readonly limit: number) {}
  async run<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw new RequestFailure({ code: 'CANCELLED' })
    if (this.running >= this.limit) {
      await new Promise<void>((resolve, reject) => {
        const enter = () => {
          signal.removeEventListener('abort', cancel)
          this.running++
          resolve()
        }
        const cancel = () => {
          this.waiting = this.waiting.filter((item) => item !== enter)
          reject(new RequestFailure({ code: 'CANCELLED' }))
        }
        this.waiting.push(enter)
        signal.addEventListener('abort', cancel, { once: true })
      })
    } else this.running++
    try {
      if (signal.aborted) throw new RequestFailure({ code: 'CANCELLED' })
      return await action()
    } finally {
      this.running--
      this.waiting.shift()?.()
    }
  }
}
