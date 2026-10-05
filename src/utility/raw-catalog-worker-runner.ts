import { Worker } from 'node:worker_threads'
import { exact, object } from '../shared/protocol'
import { byteSize, RAW_LIMITS, RawError, validPath, validRawResult } from '../shared/raw'
import { randomUUID } from 'node:crypto'
import type { WorkspaceId } from '../shared/raw'
import type { CatalogMetrics, CatalogRunner } from './raw-catalog-scan'

function validMetrics(value: unknown): value is CatalogMetrics {
  return (
    object(value) &&
    exact(value, [
      'bytes',
      'directories',
      'scanned',
      'sources',
      'excludedGit',
      'links',
      'pathTextBytes',
      'timings',
    ]) &&
    ['bytes', 'directories', 'scanned', 'sources', 'excludedGit', 'links', 'pathTextBytes'].every(
      (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0,
    ) &&
    object(value.timings) &&
    exact(value.timings, ['resolveMs', 'readMs', 'metadataMs', 'verificationMs']) &&
    Object.values(value.timings).every(
      (time) => typeof time === 'number' && Number.isFinite(time) && time >= 0,
    )
  )
}

/** One worker, one in-flight <=64 KiB packet, cooperative cancellation, exit awaited before replacement. */
export function workerCatalogRunner(path: string | URL, execArgv?: string[]): CatalogRunner {
  return (root, limits, signal, emit) =>
    new Promise((resolve, reject) => {
      const shared = new SharedArrayBuffer(4),
        cancel = new Int32Array(shared)
      const worker = new Worker(path, {
        workerData: {
          root,
          limits,
          cancel: shared,
          started: performance.timeOrigin + performance.now(),
        },
        execArgv,
      })
      let result: CatalogMetrics | null = null,
        failure: RawError | null = null
      const abort = () => {
        Atomics.store(cancel, 0, 1)
        worker.postMessage('cancel')
      }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      worker.on('message', (packet: unknown) => {
        try {
          if (!object(packet) || byteSize(packet) > RAW_LIMITS.responseBytes || result || failure)
            throw new RawError('PROTOCOL_ERROR')
          if (
            packet.type === 'entries' &&
            exact(packet, ['type', 'entries', 'metrics']) &&
            validMetrics(packet.metrics) &&
            Array.isArray(packet.entries) &&
            packet.entries.length > 0 &&
            packet.entries.length <= 64 &&
            packet.entries.every(
              (entry: unknown) =>
                object(entry) &&
                exact(entry, ['path', 'name', 'key', 'base']) &&
                validPath(entry.path) &&
                typeof entry.name === 'string' &&
                entry.name === entry.path.split('/').at(-1) &&
                entry.key === entry.path.toLowerCase() &&
                entry.base === entry.name.toLowerCase(),
            )
          ) {
            if (!signal.aborted) emit(packet.entries, packet.metrics)
            worker.postMessage('ack')
          } else if (
            packet.type === 'done' &&
            exact(packet, ['type', 'metrics']) &&
            validMetrics(packet.metrics)
          )
            result = packet.metrics
          else if (
            packet.type === 'error' &&
            exact(packet, ['type', 'result']) &&
            validRawResult(packet.result, {
              kind: 'locate',
              workspaceId: randomUUID() as WorkspaceId,
              query: '',
              limit: 1,
              catalogGeneration: null,
            }) &&
            !packet.result.ok
          )
            failure = new RawError(packet.result.error.code, packet.result.error.details)
          else throw new RawError('PROTOCOL_ERROR')
        } catch (error) {
          failure = error instanceof RawError ? error : new RawError('INTERNAL')
          abort()
        }
      })
      worker.on('error', () => {
        failure ??= new RawError('INTERNAL')
      })
      worker.on('exit', (code) => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) reject(new RawError('CANCELLED'))
        else if (failure) reject(failure)
        else if (code || !result) reject(new RawError('INTERNAL'))
        else resolve(result)
      })
    })
}
