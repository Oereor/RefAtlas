import { readonly, writable } from 'svelte/store'
import { byteSize, DIRECTORY_LIMITS } from '../../../shared/raw'
import type {
  DirectoryEntry,
  DirectoryPath,
  RawBridge,
  SourceAddress,
  WorkspaceId,
} from '../../../shared/raw'
import { errorOf, request, RequestFailure, RequestQueue } from '../state/requests'
import type { UiError } from '../state/requests'

export const EXPLORER_LIMITS = Object.freeze({
  entries: 10_000,
  bytes: 8 * 1024 * 1024,
  rowHeight: 24,
  overscan: 5,
})
export type ExplorerEntry = { id: string; entry: DirectoryEntry }
export type DirectoryState = {
  id: string
  statusId: string
  path: DirectoryPath
  status: 'unloaded' | 'loading' | 'ready' | 'error'
  entries: ExplorerEntry[]
  nextCursor: string | null
  error: UiError | null
  paging: boolean
  expanded: boolean
  epoch: number
  requestId: string | null
  touched: number
}
export type ExplorerState = {
  workspaceId: WorkspaceId | null
  generation: number
  directories: ReadonlyMap<DirectoryPath, DirectoryState>
  selectedId: string | null
  focusedId: string | null
  cacheLimited: boolean
}
export type ExplorerNode = {
  id: string
  name: string
  kind: 'root' | 'directory' | 'source' | 'status'
  directory?: DirectoryPath
  source?: SourceAddress
  action?: 'more' | 'retry' | 'refresh'
  status?: 'loading' | 'empty' | 'error' | 'more'
  error?: UiError
  unknownSize?: boolean
  children?: ExplorerNode[]
  childrenCount?: number
}
const rootPath = '' as DirectoryPath
const below = (path: string, parent: string) =>
  parent === '' || path === parent || path.startsWith(parent + '/')

export class ExplorerController {
  private state: ExplorerState = {
    workspaceId: null,
    generation: 0,
    directories: new Map(),
    selectedId: null,
    focusedId: null,
    cacheLimited: false,
  }
  private store = writable(this.state)
  readonly changes = readonly(this.store)
  private requests = new Map<DirectoryPath, AbortController>()
  private queue = new RequestQueue(DIRECTORY_LIMITS.concurrency)
  private clock = 0
  constructor(
    private readonly bridge: RawBridge,
    private readonly limits: { entries: number; bytes: number } = {
      entries: EXPLORER_LIMITS.entries,
      bytes: EXPLORER_LIMITS.bytes,
    },
  ) {}
  get snapshot(): ExplorerState {
    return this.state
  }
  private publish(change: Partial<ExplorerState> = {}): void {
    this.state = { ...this.state, ...change }
    this.store.set(this.state)
  }
  private put(record: DirectoryState): void {
    const directories = new Map(this.state.directories)
    directories.set(record.path, record)
    this.publish({ directories })
  }
  private ensure(
    path: DirectoryPath,
    id: string = crypto.randomUUID(),
  ): DirectoryState | undefined {
    const previous = this.state.directories.get(path)
    if (previous) return previous
    const record: DirectoryState = {
      id,
      statusId: crypto.randomUUID(),
      path,
      status: 'unloaded',
      entries: [],
      nextCursor: null,
      error: null,
      paging: false,
      expanded: path === '',
      epoch: 0,
      requestId: null,
      touched: ++this.clock,
    }
    if (path !== '' && !this.makeRoom(0, byteSize(record))) {
      this.publish({ cacheLimited: true })
      return undefined
    }
    this.publish({ cacheLimited: false })
    this.put(record)
    return record
  }
  reset(workspaceId: WorkspaceId | null): void {
    for (const controller of this.requests.values()) controller.abort()
    this.requests.clear()
    this.publish({
      workspaceId,
      generation: this.state.generation + 1,
      directories: new Map(),
      selectedId: null,
      focusedId: null,
      cacheLimited: false,
    })
    if (workspaceId) this.ensure(rootPath)
  }
  async open(workspaceId: WorkspaceId): Promise<void> {
    this.reset(workspaceId)
    await this.load(rootPath)
  }
  select(id: string | null): void {
    if (id !== this.state.selectedId) this.publish({ selectedId: id })
  }
  focus(id: string | null): void {
    if (id !== this.state.focusedId) this.publish({ focusedId: id })
  }
  async expand(path: DirectoryPath, id?: string): Promise<void> {
    const record = this.ensure(path, id)
    if (!record) return
    this.put({ ...record, expanded: true, touched: ++this.clock })
    if (record.status === 'unloaded') await this.load(path)
  }
  collapse(path: DirectoryPath): void {
    const directories = new Map(this.state.directories)
    for (const [key, record] of directories) {
      if (!below(key, path)) continue
      this.requests.get(key)?.abort()
      this.requests.delete(key)
      directories.set(key, {
        ...record,
        expanded: false,
        epoch: record.epoch + 1,
        paging: false,
        requestId: null,
        status: record.status === 'loading' ? 'unloaded' : record.status,
        touched: ++this.clock,
      })
    }
    this.publish({ directories })
    this.makeRoom(0, 0)
  }
  async refresh(path?: DirectoryPath): Promise<void> {
    const workspaceId = this.state.workspaceId
    if (!workspaceId) return
    if (path === undefined || path === '') {
      await this.open(workspaceId)
      return
    }
    const record = this.ensure(path)
    if (!record) return
    const removed = new Set<string>()
    for (const candidate of this.state.directories.values())
      if (below(candidate.path, path)) for (const item of candidate.entries) removed.add(item.id)
    this.collapse(path)
    const directories = new Map(this.state.directories)
    for (const key of directories.keys())
      if (key !== path && below(key, path)) directories.delete(key)
    directories.set(path, {
      ...record,
      entries: [],
      nextCursor: null,
      error: null,
      status: 'unloaded',
      expanded: true,
      paging: false,
      requestId: null,
      epoch: record.epoch + 1,
    })
    this.publish({
      directories,
      selectedId: removed.has(this.state.selectedId ?? '') ? null : this.state.selectedId,
      focusedId: removed.has(this.state.focusedId ?? '') ? record.id : this.state.focusedId,
    })
    await this.load(path)
  }
  async retry(path: DirectoryPath): Promise<void> {
    await this.load(path)
  }
  async more(path: DirectoryPath, automatic = false): Promise<void> {
    const record = this.state.directories.get(path)
    if (!record || !record.nextCursor || record.paging || (automatic && record.error)) return
    if (record.error?.code === 'STALE_CURSOR') return
    await this.load(path)
  }
  private usage(): { entries: number; bytes: number } {
    let entries = 0,
      bytes = 0
    for (const record of this.state.directories.values()) {
      entries += record.entries.length
      bytes += byteSize(record.entries) + byteSize({ ...record, entries: [] })
    }
    return { entries, bytes }
  }
  get cacheUsage(): { entries: number; bytes: number } {
    return this.usage()
  }
  private makeRoom(entries: number, bytes: number): boolean {
    let usage = this.usage()
    const protectedPaths = new Set<DirectoryPath>()
    for (const record of this.state.directories.values()) {
      if (
        record.expanded ||
        this.requests.has(record.path) ||
        record.entries.some(
          (item) => item.id === this.state.selectedId || item.id === this.state.focusedId,
        )
      ) {
        for (const candidate of this.state.directories.keys())
          if (below(record.path, candidate)) protectedPaths.add(candidate)
      }
    }
    const victims = [...this.state.directories.values()]
      .filter((record) => !protectedPaths.has(record.path))
      .sort((a, b) => a.touched - b.touched)
    for (const victim of victims) {
      if (
        usage.entries + entries <= this.limits.entries &&
        usage.bytes + bytes <= this.limits.bytes
      )
        break
      const directories = new Map(this.state.directories)
      for (const key of directories.keys())
        if (below(key, victim.path) && !protectedPaths.has(key)) directories.delete(key)
      this.publish({ directories })
      usage = this.usage()
    }
    return (
      usage.entries + entries <= this.limits.entries && usage.bytes + bytes <= this.limits.bytes
    )
  }
  private async load(path: DirectoryPath): Promise<void> {
    const workspaceId = this.state.workspaceId
    if (!workspaceId || this.requests.has(path)) return
    const record = this.ensure(path)
    if (!record) return
    const generation = this.state.generation,
      epoch = record.epoch + 1
    const cursor = record.status === 'ready' ? record.nextCursor : null
    const controller = new AbortController()
    this.requests.set(path, controller)
    this.put({
      ...record,
      epoch,
      error: null,
      paging: cursor !== null,
      status: cursor === null ? 'loading' : 'ready',
      requestId: null,
    })
    const current = () =>
      this.state.workspaceId === workspaceId &&
      this.state.generation === generation &&
      this.state.directories.get(path)?.epoch === epoch &&
      !controller.signal.aborted
    try {
      const page = await this.queue.run(controller.signal, () =>
        request(
          this.bridge,
          controller.signal,
          (requestId) =>
            this.bridge.listDirectory({
              requestId,
              workspaceId,
              directory: path,
              limit: DIRECTORY_LIMITS.page,
              cursor,
            }),
          (requestId) => {
            if (current()) this.put({ ...this.state.directories.get(path)!, requestId })
          },
        ),
      )
      if (!current()) return
      const additions = page.items.map((entry) => ({ id: crypto.randomUUID(), entry }))
      const latest = this.state.directories.get(path)!
      const replacement = {
        ...latest,
        status: 'ready' as const,
        entries: cursor === null ? additions : [...latest.entries, ...additions],
        nextCursor: page.nextCursor,
        paging: false,
        error: null,
        requestId: null,
        touched: this.clock + 1,
      }
      if (
        !this.makeRoom(
          replacement.entries.length - latest.entries.length,
          byteSize(replacement) - byteSize(latest),
        )
      )
        throw new RequestFailure({ code: 'RESOURCE_LIMIT', details: { limit: 'EXPLORER_CACHE' } })
      ++this.clock
      this.put(replacement)
    } catch (error) {
      if (current())
        this.put({
          ...this.state.directories.get(path)!,
          status: cursor === null ? 'error' : 'ready',
          paging: false,
          requestId: null,
          error: errorOf(error),
        })
    } finally {
      if (this.requests.get(path) === controller) this.requests.delete(path)
    }
  }
  tree(): ExplorerNode {
    const children = (path: DirectoryPath): ExplorerNode[] => {
      const record = this.state.directories.get(path)
      if (!record) return []
      const unknownSize = record.status !== 'ready' || record.nextCursor !== null
      const result: ExplorerNode[] = record.entries.map(({ id, entry }) =>
        entry.kind === 'directory'
          ? {
              id,
              name: entry.name,
              kind: 'directory',
              directory: entry.path,
              children: children(entry.path),
              childrenCount: 0,
              unknownSize,
            }
          : { id, name: entry.name, kind: 'source', source: entry.source, unknownSize },
      )
      if (
        record.status === 'loading' ||
        record.paging ||
        record.error ||
        record.nextCursor ||
        !result.length
      ) {
        const status =
          record.status === 'loading' || record.paging
            ? 'loading'
            : record.error
              ? 'error'
              : record.nextCursor
                ? 'more'
                : 'empty'
        result.push({
          id: record.statusId,
          name: '',
          kind: 'status',
          directory: path,
          status,
          unknownSize,
          action:
            status === 'error'
              ? record.error?.code === 'STALE_CURSOR'
                ? 'refresh'
                : 'retry'
              : status === 'more'
                ? 'more'
                : undefined,
          error: record.error ?? undefined,
        })
      }
      return result
    }
    const nodes = children(rootPath)
    if (this.state.cacheLimited)
      nodes.push({
        id: 'explorer-cache-limit',
        name: '',
        kind: 'status',
        status: 'error',
        unknownSize: true,
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'EXPLORER_CACHE' } },
      })
    return { id: 'explorer-root', name: '', kind: 'root', children: nodes }
  }
  get expandedIds(): string[] {
    return [...this.state.directories.values()]
      .filter((record) => record.expanded && record.path !== '')
      .map((record) => record.id)
  }
  find(id: string): ExplorerEntry | undefined {
    for (const record of this.state.directories.values()) {
      const entry = record.entries.find((item) => item.id === id)
      if (entry) return entry
    }
  }
}
