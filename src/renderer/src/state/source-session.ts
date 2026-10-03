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
}
export class SourceSession {
  private state: SourceSessionState = { active: null, pending: null, requestId: null, error: null }
  private store = writable(this.state)
  readonly changes = readonly(this.store)
  private epoch = 0
  private lifetime = 0
  private desired: { source: SourceAddress; epoch: number; lifetime: number } | null = null
  private controller: AbortController | null = null
  private running: Promise<void> | null = null
  constructor(private readonly bridge: RawBridge) {}
  get snapshot(): SourceSessionState {
    return this.state
  }
  markStale(source: SourceAddress, revision: SourceRevision): void {
    const active = this.state.active
    if (!active || !sameSource(active.source, source) || active.info.revision !== revision) return
    if (active.info.state === 'stale') return
    this.publish({ active: { ...active, info: { ...active.info, state: 'stale' } } })
  }
  private publish(change: Partial<SourceSessionState>): void {
    this.state = { ...this.state, ...change }
    this.store.set(this.state)
  }
  activate(source: SourceAddress): Promise<void> {
    const epoch = ++this.epoch
    this.controller?.abort()
    if (this.state.active && sameSource(source, this.state.active.source)) {
      this.desired = null
      this.publish({ pending: null, requestId: null, error: null })
      return this.running ?? Promise.resolve()
    }
    this.desired = { source, epoch, lifetime: this.lifetime }
    this.publish({ pending: source, requestId: null, error: null })
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
    })
  }
  /** Workspace open has already reset Utility; do not close the newly opened workspace. */
  reset(): void {
    ++this.epoch
    ++this.lifetime
    this.desired = null
    this.controller?.abort()
    this.publish({ active: null, pending: null, requestId: null, error: null })
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
          (requestId) => this.bridge.getSourceInfo({ requestId, source: intent.source }),
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
          })
          committed = true
          if (previous) await this.release(previous.source)
        }
      } catch (error) {
        if (current()) this.publish({ pending: null, requestId: null, error: errorOf(error) })
      } finally {
        if (
          !committed &&
          (!this.state.active || !sameSource(this.state.active.source, intent.source))
        )
          await this.release(intent.source)
        if (this.controller === controller) this.controller = null
      }
    }
  }
}
