import { MessageChannelMain, utilityProcess } from 'electron'
import type { MessagePortMain, UtilityProcess } from 'electron'
import utilityPath from '../utility/index.ts?modulePath'
import { bounded, exact, FoundationError, LIMITS, object } from '../shared/protocol'
import type { Request, Runtime, ServiceStatus, UtilityValue } from '../shared/protocol'
import { RequestBroker } from './request-broker'

export class DataService {
  private child: UtilityProcess | null = null
  private port: MessagePortMain | null = null
  private broker: RequestBroker | null = null
  private starting: Promise<void> | null = null
  private stopping: Promise<void> | null = null
  private generation = 0
  private state: ServiceStatus['state'] = 'stopped'
  private runtime: Runtime | null = null
  private startupMs = 0
  constructor(private diagnostics: boolean) {}
  status(): ServiceStatus { return { state: this.state, generation: this.generation, diagnostics: this.diagnostics, runtime: this.runtime, startupMs: this.startupMs } }
  async start(): Promise<void> {
    if (this.stopping) await this.stopping
    if (this.state === 'running') return
    if (this.starting) return this.starting
    this.state = 'starting'
    this.runtime = null
    const generation = ++this.generation
    const begin = performance.now()
    const child = utilityProcess.fork(utilityPath, [], { serviceName: 'RefAtlas Data Service', stdio: 'pipe' })
    const { port1, port2 } = new MessageChannelMain()
    const broker = new RequestBroker(request => port1.postMessage(request))
    this.child = child
    this.port = port1
    this.broker = broker
    child.stderr?.on('data', data => process.stderr.write(data))
    this.starting = new Promise<void>((resolve, reject) => {
      let ready = false
      const timeout = setTimeout(() => {
        reject(new FoundationError('TIMEOUT', '数据服务启动超时'))
        child.kill()
      }, LIMITS.startupMs)
      child.once('exit', () => {
        clearTimeout(timeout)
        broker.exit()
        port1.close()
        if (this.child === child) { this.child = null; this.port = null; this.state = 'stopped'; this.runtime = null }
        if (!ready) reject(new FoundationError('SERVICE_EXIT', '数据服务在握手前退出'))
      })
      port1.on('message', event => {
        if (this.child !== child) return
        const message: unknown = event.data
        if (!ready) {
          if (!bounded(message) || !object(message) || !exact(message, ['type', 'generation', 'runtime']) || message.type !== 'ready' || message.generation !== generation
            || !object(message.runtime) || !exact(message.runtime, ['electron', 'node', 'napi', 'modules'])
            || !Object.values(message.runtime).every(value => typeof value === 'string' && value.length < 64)) {
            clearTimeout(timeout)
            reject(new FoundationError('PROTOCOL_ERROR', '数据服务握手无效'))
            child.kill()
            return
          }
          ready = true
          clearTimeout(timeout)
          this.runtime = message.runtime as Runtime
          this.startupMs = performance.now() - begin
          this.state = 'running'
          resolve()
        } else {
          broker.accept(message)
          if (!broker.isAvailable) child.kill()
        }
      })
      port1.on('close', () => { broker.exit(); if (this.child === child) child.kill() })
      port1.start()
      child.postMessage({ type: 'connect', generation, diagnostics: this.diagnostics }, [port2])
    }).finally(() => { this.starting = null })
    return this.starting
  }
  request<Value extends UtilityValue>(request: Request, owner: number): Promise<Value> {
    if (this.state !== 'running' || !this.broker) return Promise.reject(new FoundationError('SERVICE_UNAVAILABLE', '数据服务尚未就绪'))
    return this.broker.request<Value>(request, owner)
  }
  cancel(id: string, owner: number): Promise<{ accepted: boolean }> {
    return this.broker?.cancel(id, owner) ?? Promise.resolve({ accepted: false })
  }
  rejectOwner(owner: number): void { this.broker?.rejectOwner(owner) }
  async restart(): Promise<ServiceStatus> { await this.stop(); await this.start(); return this.status() }
  async stop(): Promise<void> {
    if (this.stopping) return this.stopping
    const child = this.child
    if (!child) return
    this.state = 'stopped'
    this.broker?.exit()
    this.stopping = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new FoundationError('TIMEOUT', '数据服务退出超时')), 3000)
      child.once('exit', () => { clearTimeout(timeout); resolve() })
      child.kill()
    }).finally(() => { this.stopping = null })
    return this.stopping
  }
}
