import { readonly, writable } from 'svelte/store'
import { byteSize, FIND_LIMITS, sameSource } from '../../../shared/raw'
import type { FindMatch, RawBridge, SourceAddress, SourceRevision } from '../../../shared/raw'
import type { NodeBrowserController } from './node-browser-controller'
import { errorOf, request, RequestQueue } from '../state/requests'
import type { UiError } from '../state/requests'

export type FindState = {
  open: boolean
  query: string
  source: SourceAddress | null
  revision: SourceRevision | null
  matches: FindMatch[]
  position: number
  nextCursor: string | null
  complete: boolean
  scannedBytes: number
  sizeBytes: number
  busy: boolean
  restartRequired: boolean
  status: 'idle' | 'debouncing' | 'searching' | 'ready' | 'no-match' | 'error' | 'stale'
  error: UiError | null
}
const empty = (): FindState => ({
  open: false,
  query: '',
  source: null,
  revision: null,
  matches: [],
  position: -1,
  nextCursor: null,
  complete: false,
  scannedBytes: 0,
  sizeBytes: 0,
  busy: false,
  restartRequired: false,
  status: 'idle',
  error: null,
})
export class FindController {
  private state = empty()
  private store = writable(this.state)
  readonly changes = readonly(this.store)
  private epoch = 0
  private disposed = false
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private queue = new RequestQueue(1)
  private navigating = false
  private unsubscribe: () => void
  constructor(
    private readonly bridge: RawBridge,
    private readonly browser: NodeBrowserController,
  ) {
    this.unsubscribe = browser.session.changes.subscribe(({ active, pending, reloading }) => {
      const same = active && this.state.source && sameSource(active.source, this.state.source)
      if (!same) {
        this.stop()
        this.state = {
          ...empty(),
          source: active?.source ?? null,
          revision: active?.info.revision ?? null,
        }
        this.store.set(this.state)
      } else if (
        active.info.revision !== this.state.revision ||
        active.info.state === 'stale' ||
        reloading ||
        pending
      ) {
        this.stop()
        this.publish({
          revision: active.info.revision,
          matches: [],
          position: -1,
          nextCursor: null,
          complete: false,
          busy: false,
          scannedBytes: 0,
          restartRequired: true,
          status: active.info.state === 'stale' ? 'stale' : 'idle',
          error: null,
        })
      }
    })
  }
  get snapshot() {
    return this.state
  }
  get eligible() {
    const session = this.browser.session.snapshot
    return (
      !this.disposed &&
      !!session.active &&
      session.active.info.state === 'current' &&
      !session.pending &&
      !session.reloading &&
      this.browser.snapshot.location !== 'RECOVERING'
    )
  }
  private publish(change: Partial<FindState>) {
    this.state = { ...this.state, ...change }
    this.store.set(this.state)
  }
  private release(
    source: SourceAddress | null,
    revision: SourceRevision | null,
    cursor: string | null,
  ) {
    if (source && revision && cursor)
      void this.bridge
        .closeSourceFind({
          requestId: crypto.randomUUID(),
          source,
          expectedRevision: revision,
          cursor,
        })
        .catch(() => {})
  }
  private stop() {
    ++this.epoch
    if (this.navigating) this.browser.cancelFindNavigation()
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.controller?.abort()
    this.release(this.state.source, this.state.revision, this.state.nextCursor)
    this.controller = null
  }
  open() {
    if (this.disposed || !this.state.source) return
    if (this.state.open) return
    this.publish({ open: true })
    if (this.state.query && this.eligible) this.restart()
  }
  close() {
    this.stop()
    this.publish({
      open: false,
      matches: [],
      position: -1,
      nextCursor: null,
      busy: false,
      complete: false,
      status: 'idle',
      error: null,
      restartRequired: false,
    })
  }
  setQuery(query: string) {
    this.stop()
    this.publish({
      query,
      matches: [],
      position: -1,
      nextCursor: null,
      complete: false,
      scannedBytes: 0,
      busy: false,
      error: null,
      restartRequired: false,
      status: query && this.eligible ? 'debouncing' : 'idle',
    })
    if (byteSize(query) > FIND_LIMITS.queryBytes) {
      this.publish({
        status: 'error',
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'FIND_QUERY_BYTES' } },
      })
      return
    }
    if (!query || !this.eligible || !this.state.open) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.load()
    }, FIND_LIMITS.debounceMs)
  }
  restart() {
    this.stop()
    this.publish({
      matches: [],
      position: -1,
      nextCursor: null,
      complete: false,
      scannedBytes: 0,
      busy: false,
      error: null,
      restartRequired: false,
      status: 'idle',
    })
    return this.load()
  }
  interruptNavigation(force = false) {
    if ((this.navigating && !force) || (!this.controller && this.timer === null)) return
    this.stop()
    this.publish({
      nextCursor: null,
      busy: false,
      restartRequired: true,
      status: this.state.matches.length ? 'ready' : 'idle',
    })
  }
  async next() {
    if (!this.eligible || this.state.busy) return
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.state.position + 1 < this.state.matches.length)
      return this.select(this.state.position + 1)
    if (this.state.restartRequired) return this.restart()
    if (!this.state.complete) return this.load()
  }
  async previous() {
    if (!this.eligible || this.state.busy || this.state.position < 1) return
    return this.select(this.state.position - 1)
  }
  private async select(position: number) {
    const match = this.state.matches[position]
    if (!match || !this.eligible) return
    const epoch = this.epoch
    this.publish({ position, busy: true })
    this.navigating = true
    try {
      await this.browser.navigate(match.address, null, { preserveFocus: true })
    } finally {
      this.navigating = false
      if (epoch === this.epoch) this.publish({ busy: false })
    }
  }
  private async load() {
    if (!this.state.open || !this.state.query || !this.eligible) return
    if (byteSize(this.state.query) > FIND_LIMITS.queryBytes) {
      this.publish({
        status: 'error',
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'FIND_QUERY_BYTES' } },
      })
      return
    }
    const source = this.state.source!,
      revision = this.state.revision!,
      query = this.state.query
    const epoch = ++this.epoch,
      controller = new AbortController()
    this.controller = controller
    const current = () =>
      !controller.signal.aborted &&
      epoch === this.epoch &&
      this.eligible &&
      this.state.open &&
      this.state.query === query &&
      this.state.revision === revision &&
      !!this.state.source &&
      sameSource(this.state.source, source)
    this.publish({ busy: true, status: 'searching', error: null })
    try {
      await this.queue.run(controller.signal, async () => {
        do {
          const result = await request(this.bridge, controller.signal, (requestId) =>
            this.bridge
              .findInSource({
                requestId,
                source,
                expectedRevision: revision,
                query,
                limit: FIND_LIMITS.page,
                cursor: this.state.nextCursor,
              })
              .then((response) => {
                // request() 会丢弃取消后的响应，先关闭迟到成功批次的轮换 cursor。
                if (controller.signal.aborted && response.ok)
                  this.release(source, revision, response.value.nextCursor)
                return response
              }),
          )
          if (!current()) {
            this.release(source, revision, result.nextCursor)
            return
          }
          this.publish({
            nextCursor: result.nextCursor,
            complete: result.complete,
            scannedBytes: result.scannedBytes,
            sizeBytes: result.sizeBytes,
          })
          if (result.matches.length) {
            const matches = [...this.state.matches, ...result.matches]
            let position = this.state.matches.length
            while (
              matches.length > FIND_LIMITS.history ||
              byteSize(matches) > FIND_LIMITS.historyBytes
            ) {
              matches.shift()
              position--
            }
            this.publish({ matches, status: 'ready', busy: false })
            await this.select(Math.max(0, position))
            return
          }
          if (result.complete) {
            this.publish({ status: this.state.matches.length ? 'ready' : 'no-match' })
            return
          }
        } while (current())
      })
    } catch (error) {
      if (current()) {
        const failure = errorOf(error)
        this.release(source, revision, this.state.nextCursor)
        this.publish({ error: failure, status: 'error', nextCursor: null, restartRequired: true })
        if (failure.code === 'SOURCE_CHANGED') this.browser.session.markStale(source, revision)
      }
    } finally {
      if (current()) this.publish({ busy: false })
      if (this.controller === controller) this.controller = null
    }
  }
  dispose() {
    this.disposed = true
    this.unsubscribe()
    this.close()
  }
}
