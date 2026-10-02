import { randomUUID } from 'node:crypto'
import {
  bounded,
  FoundationError,
  LIMITS,
  object,
  exact,
  validId,
  validRequest,
  validResult,
} from '../shared/protocol'
import type { Operation, Request, UtilityValue } from '../shared/protocol'

type Pending = {
  request: Request
  wireId: string
  owner: number
  resolve: (value: UtilityValue) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}
export class RequestBroker {
  private pending = new Map<string, Pending>()
  private wireToId = new Map<string, string>()
  private available = true
  constructor(
    private send: (request: Request) => void,
    private timeoutMs: number = LIMITS.requestMs,
  ) {}
  get size(): number {
    return this.pending.size
  }
  get isAvailable(): boolean {
    return this.available
  }
  request<Value extends UtilityValue>(request: Request, owner = 0): Promise<Value> {
    if (!validRequest(request))
      return Promise.reject(new FoundationError('INVALID_INPUT', '无效请求'))
    if (!this.available)
      return Promise.reject(new FoundationError('SERVICE_UNAVAILABLE', '数据服务不可用'))
    if (this.pending.has(request.id))
      return Promise.reject(new FoundationError('INVALID_INPUT', '重复请求 ID'))
    if (
      this.pending.size >= LIMITS.pending ||
      (request.operation !== 'cancel' && this.pending.size >= LIMITS.pending - 1)
    )
      return Promise.reject(new FoundationError('BUSY', '未完成请求已达上限；保留一个取消控制槽'))
    return new Promise<Value>((resolve, reject) => {
      const wireId = randomUUID()
      const outgoing: Request =
        request.operation === 'probe'
          ? { ...request, id: wireId, input: { ...request.input, requestId: wireId } }
          : { ...request, id: wireId }
      const timer = setTimeout(() => {
        this.reject(request.id, new FoundationError('TIMEOUT', '请求超时'))
        this.sendCancellation(wireId)
      }, this.timeoutMs)
      this.pending.set(request.id, {
        request,
        wireId,
        owner,
        resolve: (value) => resolve(value as Value),
        reject,
        timer,
      })
      this.wireToId.set(wireId, request.id)
      try {
        this.send(outgoing)
      } catch {
        this.reject(request.id, new FoundationError('SERVICE_EXIT', '消息通道不可用'))
      }
    })
  }
  async cancel(id: string, owner: number): Promise<{ accepted: boolean }> {
    const task = this.pending.get(id)
    if (!task || task.owner !== owner || task.request.operation !== 'probe')
      return { accepted: false }
    return this.request(
      { type: 'request', id: randomUUID(), operation: 'cancel', targetId: task.wireId },
      owner,
    )
  }
  accept(message: unknown): void {
    if (
      !bounded(message) ||
      !object(message) ||
      !exact(message, ['type', 'id', 'result']) ||
      message.type !== 'response' ||
      !validId(message.id)
    ) {
      this.exit(new FoundationError('PROTOCOL_ERROR', '无效响应消息'))
      return
    }
    const id = this.wireToId.get(message.id)
    if (!id) return
    const task = this.pending.get(id)!
    if (!validResult(message.result, task.request.operation as Operation)) {
      this.exit(new FoundationError('PROTOCOL_ERROR', '响应内容不符合类型边界'))
      return
    }
    const pending = this.take(id)!
    if (message.result.ok) pending.resolve(message.result.value)
    else
      pending.reject(new FoundationError(message.result.error.code, message.result.error.message))
  }
  rejectOwner(owner: number): void {
    for (const [id, task] of this.pending) {
      if (task.owner === owner) {
        this.reject(id, new FoundationError('CANCELLED', '窗口已关闭'))
        this.sendCancellation(task.wireId)
      }
    }
  }
  exit(error = new FoundationError('SERVICE_EXIT', '数据服务已退出')): void {
    this.available = false
    for (const id of this.pending.keys()) this.reject(id, error)
  }
  private take(id: string): Pending | undefined {
    const task = this.pending.get(id)
    if (task) {
      clearTimeout(task.timer)
      this.pending.delete(id)
      this.wireToId.delete(task.wireId)
    }
    return task
  }
  private reject(id: string, error: Error): void {
    this.take(id)?.reject(error)
  }
  private sendCancellation(wireId: string): void {
    try {
      this.send({ type: 'request', id: randomUUID(), operation: 'cancel', targetId: wireId })
    } catch {}
  }
}
