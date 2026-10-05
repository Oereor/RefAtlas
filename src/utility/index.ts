import {
  FoundationError,
  bounded,
  exact,
  failure,
  LIMITS,
  object,
  validRequest,
} from '../shared/protocol'
import type { Response, UtilityValue } from '../shared/protocol'
import { runProbe } from './probe'
import { runSqliteSmoke } from './sqlite-smoke'
import { RawDataService } from './raw-service'
import { rawBounded, RawError, rawFailure } from '../shared/raw'
import { isAbsolute } from 'node:path'
import { RawSourceCatalog } from './raw-source-catalog'
import { workerCatalogRunner } from './raw-catalog-worker-runner'

process.parentPort.once('message', (event) => {
  const config: unknown = event.data
  if (
    !object(config) ||
    !exact(config, ['type', 'generation', 'diagnostics', 'catalogWorkerPath']) ||
    config.type !== 'connect' ||
    !Number.isSafeInteger(config.generation) ||
    typeof config.diagnostics !== 'boolean' ||
    typeof config.catalogWorkerPath !== 'string' ||
    !isAbsolute(config.catalogWorkerPath) ||
    config.catalogWorkerPath.length > 4096 ||
    event.ports.length !== 1
  )
    process.exit(2)
  const port = event.ports[0]
  const tasks = new Map<string, AbortController>()
  const raw = new RawDataService(
    undefined,
    new RawSourceCatalog(undefined, undefined, workerCatalogRunner(config.catalogWorkerPath)),
  )
  const reply = (response: Response): void => {
    if (!rawBounded(response)) process.exit(3)
    port.postMessage(response)
  }
  port.on('message', async (event) => {
    const request: unknown = event.data
    if (!validRequest(request)) {
      process.exit(4)
      return
    }
    if (request.operation === 'crash') {
      if (config.diagnostics) process.exit(17)
      reply({
        type: 'response',
        id: request.id,
        result: failure('TEST_ONLY', '仅诊断模式允许故障注入'),
      })
      return
    }
    if (request.operation === 'cancel') {
      const task = tasks.get(request.targetId)
      task?.abort()
      reply({
        type: 'response',
        id: request.id,
        result: { ok: true, value: { accepted: Boolean(task) } },
      })
      return
    }
    if (tasks.has(request.id) || tasks.size >= LIMITS.pending) {
      reply({ type: 'response', id: request.id, result: failure('BUSY', '任务重复或达到并发上限') })
      return
    }
    const controller = new AbortController()
    tasks.set(request.id, controller)
    if (request.operation === 'raw') {
      try {
        await raw.execute(request.input, controller.signal, (value) => {
          reply({ type: 'response', id: request.id, result: { ok: true, value } })
        })
      } catch (error) {
        reply({
          type: 'response',
          id: request.id,
          result: rawFailure(
            error instanceof RawError ? error.code : 'INTERNAL',
            error instanceof RawError ? error.details : undefined,
          ),
        })
      } finally {
        tasks.delete(request.id)
      }
      return
    }
    try {
      const value: UtilityValue =
        request.operation === 'probe'
          ? await runProbe(request.input, controller.signal)
          : await runSqliteSmoke()
      if (controller.signal.aborted) throw new FoundationError('CANCELLED', '任务已取消')
      reply({ type: 'response', id: request.id, result: { ok: true, value } })
    } catch (error) {
      reply({
        type: 'response',
        id: request.id,
        result: failure(
          error instanceof FoundationError ? error.code : 'INTERNAL',
          error instanceof FoundationError ? error.message : '数据服务操作失败',
        ),
      })
    } finally {
      tasks.delete(request.id)
    }
  })
  port.on('close', () => {
    raw.dispose()
    for (const task of tasks.values()) task.abort()
    process.exit(0)
  })
  port.start()
  port.postMessage({
    type: 'ready',
    generation: config.generation,
    runtime: {
      electron: process.versions.electron ?? '',
      node: process.versions.node,
      napi: process.versions.napi ?? '',
      modules: process.versions.modules ?? '',
    },
  })
})
