import { readonly, writable } from 'svelte/store'
import { RAW_LIMITS, parentPointer, sameAddress, sameSource } from '../../../shared/raw'
import type {
  ChildrenResult,
  JsonPointer,
  NodeAddress,
  NodeResult,
  NodeSummary,
  RawBridge,
  RawScalar,
  SegmentResult,
  SourceAddress,
  SourceRevision,
} from '../../../shared/raw'
import type { SourceSession, ActiveSource } from '../state/source-session'
import { errorOf, request, RequestQueue } from '../state/requests'
import type { UiError } from '../state/requests'

export const NODE_BROWSER_LIMITS = Object.freeze({ history: 128 })
export type ChildItem = ChildrenResult['items'][number]
export type NodeContext = { parentKind: 'array' | 'object'; key: string | number } | null
export type PagePosition = { cursor: string | null; number: number }
export type NodeBrowserState = {
  source: SourceAddress | null
  revision: SourceRevision | null
  current: NodeSummary | null
  context: NodeContext
  scalar: RawScalar | null
  children: ChildItem[]
  segment: SegmentResult | null
  selectedChild: ChildItem | null
  history: PagePosition[]
  position: number
  nextCursor: string | null
  busy: boolean
  pendingPointer: JsonPointer | null
  error: UiError | null
  epoch: number
  location: 'EMPTY' | 'READY' | 'RECOVERING' | 'LOCATION_MISSING' | 'ERROR'
  recoveryPointer: JsonPointer | null
}
type Intent =
  | { kind: 'navigate'; address: NodeAddress; context: NodeContext; recovering?: boolean }
  | { kind: 'page'; page: PagePosition; history: PagePosition[]; position: number }
const empty = (epoch: number): NodeBrowserState => ({
  source: null,
  revision: null,
  current: null,
  context: null,
  scalar: null,
  children: [],
  segment: null,
  selectedChild: null,
  history: [],
  position: 0,
  nextCursor: null,
  busy: false,
  pendingPointer: null,
  error: null,
  epoch,
  location: 'EMPTY',
  recoveryPointer: null,
})
export class NodeBrowserController {
  private state = empty(0)
  private store = writable(this.state)
  readonly changes = readonly(this.store)
  private queue = new RequestQueue(1)
  private controller: AbortController | null = null
  private retryIntent: Intent | null = null
  private reopening: Promise<void> | null = null
  private reloadRunning: Promise<void> | null = null
  private unsubscribe: () => void
  constructor(
    private readonly bridge: RawBridge,
    readonly session: SourceSession,
  ) {
    this.unsubscribe = session.changes.subscribe(({ active }) => this.synchronize(active))
  }
  get snapshot(): NodeBrowserState {
    return this.state
  }
  get stale(): boolean {
    return this.session.snapshot.active?.info.state === 'stale'
  }
  reload(): Promise<void> {
    if (this.reloadRunning) return this.reloadRunning
    if (!this.stale || this.session.snapshot.pending) return Promise.resolve()
    const source = this.state.source!
    const transaction = this.session
      .reload()
      .then(async () => {
        if (this.state.source && sameSource(source, this.state.source)) await this.reopening
      })
      .finally(() => {
        if (this.reloadRunning === transaction) this.reloadRunning = null
      })
    this.reloadRunning = transaction
    return transaction
  }
  returnToRoot(): Promise<void> {
    if (this.state.location !== 'LOCATION_MISSING' || !this.state.source) return Promise.resolve()
    return this.navigate({ source: this.state.source, pointer: '' as JsonPointer })
  }
  private publish(change: Partial<NodeBrowserState>): void {
    this.state = { ...this.state, ...change }
    this.store.set(this.state)
  }
  dispose(): void {
    this.unsubscribe()
    this.controller?.abort()
    this.publish({ epoch: this.state.epoch + 1, busy: false })
  }
  private synchronize(active: ActiveSource | null): void {
    const same =
      active &&
      this.state.source &&
      sameSource(active.source, this.state.source) &&
      active.info.revision === this.state.revision
    if (same) {
      if (active.info.state === 'stale') {
        this.controller?.abort()
        this.retryIntent = null
        this.publish({
          epoch: this.state.epoch + 1,
          busy: false,
          pendingPointer: null,
          ...(this.state.location === 'RECOVERING' ? { location: 'ERROR' as const } : {}),
        })
      }
      return
    }
    const recoveryPointer =
      active && this.state.source && sameSource(active.source, this.state.source)
        ? (this.state.current?.address.pointer ?? this.state.recoveryPointer)
        : null
    if (!active || !this.state.source || !sameSource(active.source, this.state.source))
      this.reloadRunning = null
    this.reopening = null
    this.controller?.abort()
    this.retryIntent = null
    this.state = empty(this.state.epoch + 1)
    if (active)
      Object.assign(this.state, {
        source: active.source,
        revision: active.info.revision,
        current: recoveryPointer ? null : active.root,
        scalar: recoveryPointer ? null : active.rootScalar,
        location: recoveryPointer ? 'RECOVERING' : 'READY',
        recoveryPointer,
      })
    this.store.set(this.state)
    if (active && active.info.state !== 'stale') {
      if (recoveryPointer)
        this.reopening = this.perform({
          kind: 'navigate',
          address: { source: active.source, pointer: recoveryPointer },
          context: null,
          recovering: true,
        })
      else this.reopening = this.needsPage() ? this.restart() : null
    }
  }
  private needsPage(): boolean {
    const kind = this.state.current?.kind
    return (
      kind === 'object' ||
      kind === 'array' ||
      ((kind === 'string' || kind === 'number') && !this.state.scalar)
    )
  }
  select(child: ChildItem | null): void {
    if (child && !this.state.children.includes(child)) return
    this.publish({ selectedChild: child })
  }
  navigate(address: NodeAddress, context: NodeContext = null): Promise<void> {
    if (
      this.stale ||
      this.session.snapshot.reloading ||
      this.state.location === 'RECOVERING' ||
      !this.state.source ||
      !sameSource(address.source, this.state.source)
    )
      return Promise.resolve()
    if (this.state.current && sameAddress(address, this.state.current.address)) {
      if (this.state.busy) {
        this.controller?.abort()
        this.retryIntent = null
        this.publish({
          epoch: this.state.epoch + 1,
          busy: false,
          pendingPointer: null,
          error: null,
        })
        if (this.needsPage() && !this.state.history.length) return this.restart()
      }
      return Promise.resolve()
    }
    return this.perform({ kind: 'navigate', address, context })
  }
  openChild(child = this.state.selectedChild): Promise<void> {
    const parentKind = this.state.current?.kind
    if (!child || (parentKind !== 'object' && parentKind !== 'array')) return Promise.resolve()
    return this.navigate(child.node.address, { parentKind, key: child.key })
  }
  parent(): Promise<void> {
    const current = this.state.current
    if (!current) return Promise.resolve()
    const pointer = parentPointer(current.address.pointer)
    return pointer === null ? Promise.resolve() : this.navigate({ ...current.address, pointer })
  }
  restart(): Promise<void> {
    if (!this.needsPage()) return Promise.resolve()
    const page = { cursor: null, number: 1 }
    return this.perform({ kind: 'page', page, history: [page], position: 0 })
  }
  previous(): Promise<void> {
    if (this.state.busy || this.state.error?.code === 'STALE_CURSOR' || this.state.position < 1)
      return Promise.resolve()
    const position = this.state.position - 1
    return this.perform({
      kind: 'page',
      page: this.state.history[position],
      history: this.state.history.slice(0, position + 1),
      position,
    })
  }
  next(): Promise<void> {
    if (this.state.busy || !this.state.nextCursor || this.state.error?.code === 'STALE_CURSOR')
      return Promise.resolve()
    const page = {
      cursor: this.state.nextCursor,
      number: this.state.history[this.state.position].number + 1,
    }
    const history = [...this.state.history.slice(0, this.state.position + 1), page].slice(
      -NODE_BROWSER_LIMITS.history,
    )
    return this.perform({ kind: 'page', page, history, position: history.length - 1 })
  }
  retry(): Promise<void> {
    if (this.state.error?.code === 'STALE_CURSOR') return this.restart()
    return this.retryIntent ? this.perform(this.retryIntent) : Promise.resolve()
  }
  private async page(
    intent: Extract<Intent, { kind: 'page' }>,
    signal: AbortSignal,
    current: () => boolean,
  ): Promise<void> {
    const node = this.state.current!
    const input = {
      address: node.address,
      expectedRevision: this.state.revision!,
      cursor: intent.page.cursor,
    }
    if (node.kind === 'object' || node.kind === 'array') {
      const result = await request(this.bridge, signal, (requestId) =>
        this.bridge.listNodeChildren({ ...input, requestId, limit: RAW_LIMITS.page }),
      )
      if (current())
        this.publish({
          children: result.items,
          segment: null,
          selectedChild: null,
          nextCursor: result.nextCursor,
          history: intent.history,
          position: intent.position,
        })
    } else {
      const result = await request(this.bridge, signal, (requestId) =>
        this.bridge.readScalarSegment({ ...input, requestId, limit: RAW_LIMITS.segment }),
      )
      if (current())
        this.publish({
          segment: result,
          children: [],
          nextCursor: result.nextCursor,
          history: intent.history,
          position: intent.position,
          selectedChild: null,
        })
    }
  }
  private async perform(intent: Intent): Promise<void> {
    if (
      this.stale ||
      this.session.snapshot.reloading ||
      (intent.kind === 'page' && !this.state.current) ||
      !this.state.source ||
      !this.state.revision
    )
      return
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const source = this.state.source,
      revision = this.state.revision,
      epoch = this.state.epoch + 1
    this.publish({
      epoch,
      busy: true,
      error: null,
      pendingPointer: intent.kind === 'navigate' ? intent.address.pointer : null,
      ...(intent.kind === 'navigate' ? { selectedChild: null } : {}),
      ...(intent.kind === 'navigate' && intent.recovering
        ? { location: 'RECOVERING' as const }
        : {}),
    })
    const current = () =>
      !controller.signal.aborted &&
      this.state.epoch === epoch &&
      this.state.source !== null &&
      sameSource(this.state.source, source) &&
      this.state.revision === revision &&
      !this.stale
    this.retryIntent = intent
    try {
      await this.queue.run(controller.signal, async () => {
        if (intent.kind === 'navigate') {
          let result: NodeResult
          try {
            result = await request(this.bridge, controller.signal, (requestId) =>
              this.bridge.readNode({
                requestId,
                address: intent.address,
                expectedRevision: revision,
              }),
            )
          } catch (error) {
            if (!current()) return
            if (!intent.recovering || errorOf(error).code !== 'NOT_FOUND') throw error
            // A raw NOT_FOUND may also be a file disappearing between verify and open.
            const info = await request(this.bridge, controller.signal, (requestId) =>
              this.bridge.getSourceInfo({ requestId, source }),
            )
            if (!current()) return
            if (info.state === 'stale' || info.revision !== revision) {
              this.session.markStale(source, revision)
              return
            }
            this.retryIntent = null
            this.publish({ location: 'LOCATION_MISSING', recoveryPointer: intent.address.pointer })
            return
          }
          if (!current()) return
          const scalar =
            result.mode === 'complete' &&
            result.value.kind !== 'object' &&
            result.value.kind !== 'array'
              ? result.value
              : null
          this.publish({
            current: result.node,
            context: intent.context,
            scalar,
            children: [],
            segment: null,
            selectedChild: null,
            history: [],
            position: 0,
            nextCursor: null,
            pendingPointer: null,
            location: 'READY',
            recoveryPointer: null,
          })
          if (this.needsPage()) {
            const page = { cursor: null, number: 1 }
            this.retryIntent = { kind: 'page', page, history: [page], position: 0 }
            await this.page(this.retryIntent, controller.signal, current)
          }
        } else await this.page(intent, controller.signal, current)
      })
      if (current()) this.retryIntent = null
    } catch (error) {
      if (current()) {
        const failure = errorOf(error)
        this.publish({
          error: failure,
          ...(this.state.location === 'RECOVERING' ? { location: 'ERROR' as const } : {}),
        })
        if (failure.code === 'SOURCE_CHANGED') this.session.markStale(source, revision)
      }
    } finally {
      if (current()) this.publish({ busy: false, pendingPointer: null })
      if (this.controller === controller) this.controller = null
    }
  }
}
