import { FoundationError, bounded, exact, failure, LIMITS, object, validRequest } from '../shared/protocol'
import type { Response, UtilityValue } from '../shared/protocol'
import { runProbe } from './probe'
import { runSqliteSmoke } from './sqlite-smoke'

process.parentPort.once('message', event => {
  const config: unknown = event.data
  if (!object(config) || !exact(config, ['type', 'generation', 'diagnostics']) || config.type !== 'connect'
    || !Number.isSafeInteger(config.generation) || typeof config.diagnostics !== 'boolean' || event.ports.length !== 1) process.exit(2)
  const port = event.ports[0]
  const tasks = new Map<string, AbortController>()
  const reply = (response: Response): void => {
    if (!bounded(response)) process.exit(3)
    port.postMessage(response)
  }
  port.on('message', async event => {
    const request: unknown = event.data
    if (!validRequest(request)) { process.exit(4); return }
    if (request.operation === 'crash') {
      if (config.diagnostics) process.exit(17)
      reply({ type: 'response', id: request.id, result: failure('TEST_ONLY', '仅诊断模式允许故障注入') })
      return
    }
    if (request.operation === 'cancel') {
      const task = tasks.get(request.targetId)
      task?.abort()
      reply({ type: 'response', id: request.id, result: { ok: true, value: { accepted: Boolean(task) } } })
      return
    }
    if (tasks.has(request.id) || tasks.size >= LIMITS.pending) {
      reply({ type: 'response', id: request.id, result: failure('BUSY', '任务重复或达到并发上限') })
      return
    }
    const controller = new AbortController()
    tasks.set(request.id, controller)
    try {
      const value: UtilityValue = request.operation === 'probe' ? await runProbe(request.input, controller.signal) : await runSqliteSmoke()
      if (controller.signal.aborted) throw new FoundationError('CANCELLED', '任务已取消')
      reply({ type: 'response', id: request.id, result: { ok: true, value } })
    } catch (error) {
      reply({ type: 'response', id: request.id, result: failure(error instanceof FoundationError ? error.code : 'INTERNAL', error instanceof FoundationError ? error.message : '数据服务操作失败') })
    } finally { tasks.delete(request.id) }
  })
  port.on('close', () => { for (const task of tasks.values()) task.abort(); process.exit(0) })
  port.start()
  port.postMessage({ type: 'ready', generation: config.generation, runtime: {
    electron: process.versions.electron ?? '', node: process.versions.node, napi: process.versions.napi ?? '', modules: process.versions.modules ?? ''
  } })
})
