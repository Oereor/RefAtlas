import { parentPort, workerData } from 'node:worker_threads'
import { RawError, rawFailure } from '../shared/raw'
import { filesystemError } from './raw-filesystem'
import { scanCatalog } from './raw-catalog-scan'
import type { CatalogLimits } from './raw-catalog-scan'

const port = parentPort!
const config = workerData as {
  root: string
  limits: CatalogLimits
  cancel: SharedArrayBuffer
  started: number
}
const cancel = new Int32Array(config.cancel)
let acknowledge: (() => void) | null = null
port.on('message', (message: unknown) => {
  if (message === 'ack' || message === 'cancel') {
    acknowledge?.()
    acknowledge = null
  }
})
async function run() {
  try {
    const metrics = await scanCatalog(
      config.root,
      config.limits,
      () => {
        if (Atomics.load(cancel, 0)) throw new RawError('CANCELLED')
      },
      (entries, metrics) =>
        new Promise<void>((resolve) => {
          acknowledge = resolve
          port.postMessage({ type: 'entries', entries, metrics })
        }),
      config.started - performance.timeOrigin,
    )
    port.postMessage({ type: 'done', metrics })
  } catch (error) {
    const failure = filesystemError(error)
    port.postMessage({ type: 'error', result: rawFailure(failure.code, failure.details) })
  } finally {
    port.close()
  }
}
void run()
