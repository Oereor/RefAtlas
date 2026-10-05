import { randomUUID } from 'node:crypto'
import { setImmediate as yieldTurn } from 'node:timers/promises'
import { byteSize, LOCATOR_LIMITS, RAW_LIMITS, RawError } from '../shared/raw'
import type {
  CatalogResult,
  LocatorItem,
  LocatorResult,
  RawCommand,
  WorkspaceId,
} from '../shared/raw'
import { filesystemError } from './raw-filesystem'
import { inlineCatalogRunner } from './raw-catalog-scan'
import type { CatalogEntry, CatalogRunner } from './raw-catalog-scan'

type Workspace = { id: WorkspaceId; root: string; generation: number }
type Entry = CatalogEntry
type Build = {
  workspace: Workspace
  generation: string
  controller: AbortController
  done: Promise<void>
  status: 'building' | 'ready' | 'error'
  error: RawError | null
  entries: Entry[]
  bytes: number
  directories: number
  scanned: number
  buildMs: number
  excludedGit: number
  links: number
  pathTextBytes: number
  timings: { resolveMs: number; readMs: number; metadataMs: number; verificationMs: number }
}

/** Path metadata only. No source registration, watcher, file open, or parser access. */
export class RawSourceCatalog {
  private current: Build | null = null
  private tail: Promise<void> = Promise.resolve()
  constructor(
    private readonly limits: {
      readonly [Key in keyof typeof LOCATOR_LIMITS]: number
    } = LOCATOR_LIMITS,
    private readonly responseBytes = RAW_LIMITS.responseBytes,
    private readonly runner: CatalogRunner = inlineCatalogRunner,
  ) {}
  get metrics() {
    const build = this.current
    return (
      build && {
        status: build.status,
        sources: build.entries.length,
        accountedBytes: build.bytes,
        directories: build.directories,
        scanned: build.scanned,
        buildMs: build.buildMs,
        excludedGit: build.excludedGit,
        links: build.links,
        pathTextBytes: build.pathTextBytes,
        timings: { ...build.timings },
      }
    )
  }
  clear(): Promise<void> {
    this.current?.controller.abort()
    this.current = null
    return this.tail
  }
  rebuild(workspace: Workspace): CatalogResult {
    this.current?.controller.abort()
    const build: Build = {
      workspace,
      generation: randomUUID(),
      controller: new AbortController(),
      done: Promise.resolve(),
      status: 'building',
      error: null,
      entries: [],
      bytes: 0,
      directories: 0,
      scanned: 0,
      buildMs: 0,
      excludedGit: 0,
      links: 0,
      pathTextBytes: 0,
      timings: { resolveMs: 0, readMs: 0, metadataMs: 0, verificationMs: 0 },
    }
    this.current = build
    // Wait for the previous handle's finally before starting; the IPC reply never waits for traversal.
    build.done = this.tail
      .then(async () => {
        await yieldTurn()
        this.check(build)
        const started = performance.now()
        try {
          const metrics = await this.runner(
            build.workspace.root,
            this.limits,
            build.controller.signal,
            (entries, metrics) => {
              this.check(build)
              build.entries.push(...entries)
              Object.assign(build, { ...metrics, entries: build.entries })
            },
          )
          this.check(build)
          if (performance.now() - started > this.limits.buildMs)
            throw new RawError('RESOURCE_LIMIT', { limit: 'CATALOG_BUILD_MS' })
          if (metrics.sources !== build.entries.length) throw new RawError('PROTOCOL_ERROR')
          Object.assign(build, metrics)
          build.status = 'ready'
        } finally {
          build.buildMs = performance.now() - started
        }
      })
      .catch((error: unknown) => {
        if (this.current === build) {
          build.entries = []
          build.status = 'error'
          build.error = filesystemError(error)
        }
      })
    this.tail = build.done
    return { workspaceId: workspace.id, catalogGeneration: build.generation }
  }
  private check(build: Build): void {
    if (this.current !== build || build.controller.signal.aborted) throw new RawError('CANCELLED')
  }
  async locate(
    command: Extract<RawCommand, { kind: 'locate' }>,
    guard: () => void,
  ): Promise<LocatorResult> {
    guard()
    const build = this.current
    if (!build || build.workspace.id !== command.workspaceId)
      throw new RawError('WORKSPACE_NOT_OPEN')
    if (command.catalogGeneration !== null && command.catalogGeneration !== build.generation)
      throw new RawError('STALE_CURSOR')
    const started = performance.now()
    const check = () => {
      guard()
      this.check(build)
      if (performance.now() - started > this.limits.queryMs)
        throw new RawError('RESOURCE_LIMIT', { limit: 'LOCATOR_QUERY_MS' })
    }
    check()
    if (build.error) throw build.error
    const result: LocatorResult = {
      workspaceId: command.workspaceId,
      catalogGeneration: build.generation,
      query: command.query,
      status: build.status === 'ready' ? 'ready' : 'building',
      items: [],
      truncated: false,
    }
    if (result.status === 'building' || !command.query) return result
    const key = command.query.toLowerCase()
    const top: { entry: Entry; rank: number }[] = []
    let matches = 0
    for (let index = 0; index < build.entries.length; index++) {
      const entry = build.entries[index]
      const rank =
        entry.base === key
          ? 0
          : entry.base.startsWith(key)
            ? 1
            : entry.base.includes(key)
              ? 2
              : entry.key.includes(key)
                ? 3
                : 4
      if (rank < 4) {
        matches++
        const at = top.findIndex(
          (candidate) =>
            rank < candidate.rank || (rank === candidate.rank && entry.path < candidate.entry.path),
        )
        if (at >= 0) top.splice(at, 0, { entry, rank })
        else if (top.length < command.limit) top.push({ entry, rank })
        if (top.length > command.limit) top.pop()
      }
      if ((index + 1) % this.limits.queryYieldEvery === 0) {
        await yieldTurn()
        check()
      }
    }
    for (const { entry } of top) {
      const item: LocatorItem = {
        name: entry.name,
        source: { workspaceId: command.workspaceId, relativePath: entry.path },
      }
      const candidate = { ...result, items: [...result.items, item], truncated: true }
      if (
        byteSize({ type: 'response', id: randomUUID(), result: { ok: true, value: candidate } }) >
        this.responseBytes
      )
        break
      result.items.push(item)
    }
    result.truncated = matches > result.items.length
    if (result.truncated && !result.items.length)
      throw new RawError('RESOURCE_LIMIT', { limit: 'RESPONSE_BYTES' })
    check()
    return result
  }
}
