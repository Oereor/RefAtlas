import { readonly, writable } from 'svelte/store'
import { LOCATOR_LIMITS, rawBounded, RAW_LIMITS } from '../../../shared/raw'
import type { LocatorItem, RawBridge, WorkspaceId } from '../../../shared/raw'
import type { SourceSession } from '../state/source-session'
import { errorOf, request, RequestFailure } from '../state/requests'
import type { UiError } from '../state/requests'

export type LocatorState = {
  workspaceId: WorkspaceId | null
  open: boolean
  query: string
  status: 'idle' | 'loading' | 'building' | 'ready' | 'error'
  catalogGeneration: string | null
  items: LocatorItem[]
  selected: number
  truncated: boolean
  error: UiError | null
}
export class SourceLocatorController {
  private state: LocatorState = {
    workspaceId: null,
    open: false,
    query: '',
    status: 'idle',
    catalogGeneration: null,
    items: [],
    selected: -1,
    truncated: false,
    error: null,
  }
  private store = writable(this.state)
  readonly changes = readonly(this.store)
  private epoch = 0
  private desired: { epoch: number; refresh: boolean } | null = null
  private controller: AbortController | null = null
  private running: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private refreshPending = false
  constructor(
    private readonly bridge: RawBridge,
    private readonly session: SourceSession,
  ) {}
  get snapshot(): LocatorState {
    return this.state
  }
  private publish(change: Partial<LocatorState>): void {
    this.state = { ...this.state, ...change }
    this.store.set(this.state)
  }
  reset(workspaceId: WorkspaceId | null): void {
    this.close()
    this.refreshPending = false
    this.publish({ workspaceId, catalogGeneration: null })
  }
  open(): void {
    if (!this.state.workspaceId || this.state.open) return
    this.publish({ open: true, query: '' })
    this.enqueue()
  }
  close(): void {
    ++this.epoch
    this.desired = null
    this.controller?.abort()
    this.stopTimer()
    this.publish({
      open: false,
      query: '',
      status: 'idle',
      items: [],
      selected: -1,
      truncated: false,
      error: null,
    })
  }
  setQuery(query: string): void {
    if (!this.state.open || query === this.state.query) return
    this.publish({ query })
    this.enqueue()
  }
  refresh(): void {
    if (!this.state.open) return
    this.refreshPending = true
    this.publish({ catalogGeneration: null })
    this.enqueue()
  }
  move(delta: number): void {
    if (!this.state.items.length) return
    this.publish({
      selected: Math.max(0, Math.min(this.state.items.length - 1, this.state.selected + delta)),
    })
  }
  async activate(index = this.state.selected): Promise<void> {
    const item = this.state.items[index]
    if (
      !this.state.open ||
      this.state.status !== 'ready' ||
      !item ||
      item.source.workspaceId !== this.state.workspaceId
    )
      return
    this.close()
    await this.session.activate(item.source)
  }
  private stopTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }
  private enqueue(): void {
    const epoch = ++this.epoch
    this.stopTimer()
    this.controller?.abort()
    this.desired = { epoch, refresh: this.refreshPending }
    this.publish({
      status: this.state.status === 'building' ? 'building' : 'loading',
      items: [],
      selected: -1,
      truncated: false,
      error: null,
    })
    if (!this.running) this.start()
  }
  private start(): void {
    this.running = this.drain().finally(() => {
      this.running = null
      if (this.desired) this.start()
    })
  }
  private async drain(): Promise<void> {
    while (this.desired) {
      const intent = this.desired
      this.desired = null
      const workspaceId = this.state.workspaceId!,
        query = this.state.query
      const controller = new AbortController()
      this.controller = controller
      const current = () =>
        this.state.open &&
        this.state.workspaceId === workspaceId &&
        intent.epoch === this.epoch &&
        !controller.signal.aborted
      try {
        if (intent.refresh) {
          const refreshed = await request(this.bridge, controller.signal, (requestId) =>
            this.bridge.refreshSourceCatalog({ requestId, workspaceId }),
          )
          if (!current()) continue
          this.refreshPending = false
          this.publish({ catalogGeneration: refreshed.catalogGeneration })
        }
        const input = {
          workspaceId,
          query,
          limit: LOCATOR_LIMITS.page,
          catalogGeneration: this.state.catalogGeneration,
        }
        if (!rawBounded({ ...input, requestId: crypto.randomUUID() }, RAW_LIMITS.requestBytes))
          throw new RequestFailure({ code: 'INVALID_INPUT' })
        const result = await request(this.bridge, controller.signal, (requestId) =>
          this.bridge.locateSources({ requestId, ...input }),
        )
        if (!current()) continue
        this.publish({
          catalogGeneration: result.catalogGeneration,
          status: result.status,
          items: result.items,
          selected: result.items.length ? 0 : -1,
          truncated: result.truncated,
          error: null,
        })
        if (result.status === 'building')
          this.timer = setTimeout(() => {
            this.timer = null
            if (current()) this.enqueue()
          }, 250)
      } catch (error) {
        if (current())
          this.publish({
            status: 'error',
            error: errorOf(error),
            items: [],
            selected: -1,
            truncated: false,
          })
      } finally {
        if (this.controller === controller) this.controller = null
      }
    }
  }
}
