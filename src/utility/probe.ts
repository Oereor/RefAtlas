import type { ProbeInput, ProbeResult } from '../shared/protocol'
import { FoundationError } from '../shared/protocol'

export function runProbe(input: ProbeInput, signal: AbortSignal): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    let completedSteps = 0
    let timer: ReturnType<typeof setTimeout>
    const cancel = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      reject(new FoundationError('CANCELLED', '任务已取消'))
    }
    if (signal.aborted) {
      cancel()
      return
    }
    signal.addEventListener('abort', cancel, { once: true })
    const step = (): void => {
      if (signal.aborted) return
      completedSteps += 1
      if (completedSteps === input.steps) {
        signal.removeEventListener('abort', cancel)
        resolve({ completedSteps })
        return
      }
      timer = setTimeout(step, input.stepDelayMs)
    }
    timer = setTimeout(step, input.stepDelayMs)
  })
}
