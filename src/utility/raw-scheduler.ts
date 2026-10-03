import { RawError } from '../shared/raw'
import { LIMITS } from '../shared/protocol'

type Job = { start: () => void; signal: AbortSignal; abort: () => void }

// 仅管理有限 FIFO 槽位；source/workspace 所有权仍由 RawDataService 管理。
export class RawScheduler {
  private active = 0
  private queued: Job[] = []
  constructor(private readonly concurrency: number) {}
  run<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    if (signal.aborted) return Promise.reject(new RawError('CANCELLED'))
    if (this.active + this.queued.length >= LIMITS.pending)
      return Promise.reject(new RawError('BUSY'))
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        signal,
        abort: () => {
          const index = this.queued.indexOf(job)
          if (index < 0) return
          this.queued.splice(index, 1)
          signal.removeEventListener('abort', job.abort)
          reject(new RawError('CANCELLED'))
        },
        start: () => {
          signal.removeEventListener('abort', job.abort)
          this.active++
          void Promise.resolve()
            .then(() => {
              if (signal.aborted) throw new RawError('CANCELLED')
              return action()
            })
            .then(resolve, reject)
            .finally(() => {
              this.active--
              this.pump()
            })
        },
      }
      this.queued.push(job)
      signal.addEventListener('abort', job.abort, { once: true })
      this.pump()
    })
  }
  private pump(): void {
    while (this.active < this.concurrency && this.queued.length) this.queued.shift()!.start()
  }
}
