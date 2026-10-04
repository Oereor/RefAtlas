import { readonly, writable } from 'svelte/store'
import { sameSource } from '../../../shared/raw'
import type {
  JsonPointer,
  NodeSummary,
  RawBridge,
  RawScalar,
  SourceAddress,
  SourceInfo,
  SourceRevision,
} from '../../../shared/raw'
import { errorOf, request } from './requests'
import type { UiError } from './requests'

export type ActiveSource = {
  source: SourceAddress
  info: SourceInfo
  root: NodeSummary
  rootScalar: RawScalar | null
}
export type SourceSessionState = {
  active: ActiveSource | null
  pending: SourceAddress | null
  requestId: string | null
  error: UiError | null
  errorOperation: 'activate' | 'reload' | null
  reloading: boolean
}
type SourceIntent = {
  kind: 'activate' | 'reload'
  source: SourceAddress
  epoch: number
  lifetime: number
}
export class SourceSession {
  private state: SourceSessionState = {
    active: null,
    pending: null,
    requestId: null,
    error: null,
    errorOperation: null,
    reloading: false,
  }
  private store = writable(this.state)
  readonly changes = readonly(this.store)
  private epoch = 0
  private lifetime = 0
  private desired: SourceIntent | null = null
  private controller: AbortController | null = null
  private running: Promise<void> | null = null
  private visible = false
  private disposed = false
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private pollController: AbortController | null = null
  private pollRunning: Promise<void> | null = null
  private pollImmediate = false
  constructor(private readonly bridge: RawBridge) {}
  get snapshot(): SourceSessionState {
    return this.state
  }
  markStale(source: SourceAddress, revision: SourceRevision): void {
    const active = this.state.active
    if (!active || !sameSource(active.source, source) || active.info.revision !== revision) return
    if (active.info.state === 'stale') return
    this.stopPolling()
    this.publish({ active: { ...active, info: { ...active.info, state: 'stale' } } })
  }
  private publish(change: Partial<SourceSessionState>): void {
    this.state = { ...this.state, ...change }
    this.store.set(this.state)
  }
  activate(source: SourceAddress): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const epoch = ++this.epoch
    this.stopPolling()
    this.controller?.abort()
    if (this.state.active && sameSource(source, this.state.active.source)) {
      this.desired = null
      this.publish({
        pending: null,
        requestId: null,
        error: null,
        errorOperation: null,
        reloading: false,
      })
      this.schedulePoll(true)
      return this.running ?? Promise.resolve()
    }
    this.desired = { kind: 'activate', source, epoch, lifetime: this.lifetime }
    this.publish({
      pending: source,
      requestId: null,
      error: null,
      errorOperation: null,
      reloading: false,
    })
    if (!this.running) this.start()
    return this.running!
  }
  reload(): Promise<void> {
    if (this.state.reloading) return this.running ?? Promise.resolve()
    const active = this.state.active
    if (this.disposed || !active || active.info.state !== 'stale' || this.state.pending)
      return Promise.resolve()
    const epoch = ++this.epoch
    this.stopPolling()
    this.controller?.abort()
    this.desired = { kind: 'reload', source: active.source, epoch, lifetime: this.lifetime }
    this.publish({ reloading: true, requestId: null, error: null, errorOperation: null })
    if (!this.running) this.start()
    return this.running!
  }
  private start(): void {
    this.running = this.drain().finally(() => {
      this.running = null
      // A subscriber may enqueue intent at the completion boundary; never strand it.
      if (this.desired) {
        this.start()
        return this.running!
      }
      this.schedulePoll(true)
    })
  }
  /** Workspace open has already reset Utility; do not close the newly opened workspace. */
  reset(): void {
    ++this.epoch
    ++this.lifetime
    this.desired = null
    this.stopPolling()
    this.controller?.abort()
    this.publish({
      active: null,
      pending: null,
      requestId: null,
      error: null,
      errorOperation: null,
      reloading: false,
    })
  }
  async dispose(): Promise<void> {
    const active = this.state.active
    this.disposed = true
    this.reset()
    await this.running
    await this.pollRunning
    if (active) await this.release(active.source)
  }
  setMonitoringVisible(visible: boolean): void {
    if (this.disposed || this.visible === visible) return
    this.visible = visible
    if (visible) this.schedulePoll(true)
    else this.stopPolling()
  }
  private eligible(): boolean {
    return (
      !this.disposed &&
      this.visible &&
      !this.running &&
      !this.state.pending &&
      !this.state.reloading &&
      this.state.active?.info.state === 'current'
    )
  }
  private stopPolling(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer)
    this.pollTimer = null
    this.pollImmediate = false
    this.pollController?.abort()
  }
  private schedulePoll(immediate = false): void {
    if (!this.eligible()) return
    if (this.pollRunning) {
      this.pollImmediate ||= immediate
      return
    }
    if (this.pollTimer !== null) {
      if (!immediate) return
      clearTimeout(this.pollTimer)
    }
    this.pollTimer = setTimeout(
      () => {
        this.pollTimer = null
        if (!this.eligible()) return
        this.pollRunning = this.poll().finally(() => {
          this.pollRunning = null
          const immediate = this.pollImmediate
          this.pollImmediate = false
          this.schedulePoll(immediate)
        })
      },
      immediate ? 0 : 1000,
    )
  }
  private async poll(): Promise<void> {
    const active = this.state.active!,
      epoch = this.epoch,
      lifetime = this.lifetime
    const controller = new AbortController()
    this.pollController = controller
    const current = () =>
      !controller.signal.aborted &&
      epoch === this.epoch &&
      lifetime === this.lifetime &&
      this.state.active !== null &&
      sameSource(this.state.active.source, active.source) &&
      this.state.active.info.revision === active.info.revision
    try {
      const info = await request(this.bridge, controller.signal, (requestId) =>
        this.bridge.getSourceInfo({ requestId, source: active.source }),
      )
      if (current() && (info.state === 'stale' || info.revision !== active.info.revision))
        this.markStale(active.source, active.info.revision)
    } catch (error) {
      if (current() && errorOf(error).code === 'SOURCE_CHANGED')
        this.markStale(active.source, active.info.revision)
      // A transient monitoring error does not replace the user's rendered view/error.
    } finally {
      if (this.pollController === controller) this.pollController = null
    }
  }
  private async release(source: SourceAddress): Promise<void> {
    try {
      await this.bridge.releaseSource({ requestId: crypto.randomUUID(), source })
    } catch {}
  }
  private async drain(): Promise<void> {
    while (this.desired) {
      const intent = this.desired
      this.desired = null
      const controller = new AbortController()
      this.controller = controller
      const current = () =>
        intent.epoch === this.epoch &&
        intent.lifetime === this.lifetime &&
        !controller.signal.aborted
      let committed = false
      try {
        const started = (requestId: string) => {
          if (current()) this.publish({ requestId })
        }
        const info = await request(
          this.bridge,
          controller.signal,
          (requestId) =>
            intent.kind === 'reload'
              ? this.bridge.reloadSource({ requestId, source: intent.source })
              : this.bridge.getSourceInfo({ requestId, source: intent.source }),
          started,
        )
        const result = await request(
          this.bridge,
          controller.signal,
          (requestId) =>
            this.bridge.readNode({
              requestId,
              address: { source: intent.source, pointer: '' as JsonPointer },
              expectedRevision: info.revision,
            }),
          started,
        )
        if (current()) {
          const previous = this.state.active
          this.publish({
            active: {
              source: intent.source,
              // Successful root read completes syntax validation in RawDataService.
              info: { ...info, validated: true },
              root: result.node,
              rootScalar:
                result.mode === 'complete' &&
                result.value.kind !== 'object' &&
                result.value.kind !== 'array'
                  ? result.value
                  : null,
            },
            pending: null,
            requestId: null,
            error: null,
            errorOperation: null,
            reloading: false,
          })
          committed = true
          if (previous && !sameSource(previous.source, intent.source))
            await this.release(previous.source)
        }
      } catch (error) {
        if (current())
          this.publish({
            pending: null,
            requestId: null,
            error: errorOf(error),
            errorOperation: intent.kind,
            reloading: false,
          })
      } finally {
        if (
          !committed &&
          (intent.kind === 'reload' ||
            !this.state.active ||
            !sameSource(this.state.active.source, intent.source))
        )
          await this.release(intent.source)
        if (this.controller === controller) this.controller = null
      }
    }
  }
}
