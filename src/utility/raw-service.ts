import { randomUUID } from 'node:crypto'
import { watch } from 'node:fs'
import type { FSWatcher, BigIntStats } from 'node:fs'
import { lstat, open, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { byteSize, RAW_LIMITS, RawError, validCommand } from '../shared/raw'
import type {
  ChildrenResult,
  NodeAddress,
  NodeSummary,
  RawCommand,
  RawOutput,
  SourceAddress,
  SourceInfo,
  SourceRevision,
  WorkspaceId,
} from '../shared/raw'
import { scanJson, WorkBudget } from './raw-parser'
import type { ParsedNode, ScanResult } from './raw-parser'

type Source = {
  address: SourceAddress
  path: string
  revision: SourceRevision
  stamp: string
  size: number
  stale: boolean
  validated: boolean
  hash: string | null
}
type Cursor = {
  address: NodeAddress
  revision: SourceRevision
  kind: 'children' | 'segment'
  after: number
}
type CacheEntry = { node: ParsedNode; bytes: number }
const stamp = (value: BigIntStats): string =>
  [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(':')
const keyOf = (source: SourceAddress): string =>
  JSON.stringify([source.workspaceId, source.relativePath])
const addressKey = (address: NodeAddress, revision: SourceRevision): string =>
  JSON.stringify([
    address.source.workspaceId,
    address.source.relativePath,
    address.pointer,
    revision,
  ])

export class RawDataService {
  private workspace: { id: WorkspaceId; root: string } | null = null
  private sources = new Map<string, Source>()
  private watchers = new Map<string, FSWatcher>()
  private ranges = new Map<string, CacheEntry>()
  private rangeBytes = 0
  private cursors = new Map<string, Cursor>()
  private tasks = new Set<AbortController>()
  private queue: Promise<unknown> = Promise.resolve()
  private polling = false
  private opening = false
  private timer: ReturnType<typeof setInterval>
  constructor(private readonly observe?: (work: { bytesRead: number; tokens: number }) => void) {
    this.timer = setInterval(() => {
      void this.poll()
    }, 1000)
    this.timer.unref()
  }
  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      for (const source of this.sources.values())
        if (!source.stale) await this.verify(source).catch(() => {})
    } finally {
      this.polling = false
    }
  }
  private invalidate(source: Source): void {
    source.stale = true
    source.validated = false
    source.hash = null
    // 文件级失效；所有访问缓存均是可重建的，初版保守清空。
    this.ranges.clear()
    this.rangeBytes = 0
    for (const [id, cursor] of this.cursors)
      if (keyOf(cursor.address.source) === keyOf(source.address)) this.cursors.delete(id)
  }
  private reset(): void {
    for (const task of this.tasks) task.abort()
    for (const watcher of this.watchers.values()) watcher.close()
    this.watchers.clear()
    this.sources.clear()
    this.ranges.clear()
    this.rangeBytes = 0
    this.cursors.clear()
    this.workspace = null
  }
  dispose(): void {
    clearInterval(this.timer)
    this.reset()
  }
  async execute(command: RawCommand, signal: AbortSignal): Promise<RawOutput> {
    if (!validCommand(command)) throw new RawError('INVALID_INPUT')
    if (signal.aborted) throw new RawError('CANCELLED')
    if (command.kind === 'close') {
      this.requireWorkspace(command.workspaceId)
      this.reset()
      return { closed: true }
    }
    if (command.kind === 'open') {
      if (this.opening) throw new RawError('BUSY')
      this.opening = true
      this.reset()
      try {
        if (!isAbsolute(command.root)) throw new RawError('INVALID_INPUT')
        const root = await realpath(command.root)
        if (!(await stat(root)).isDirectory()) throw new RawError('INVALID_INPUT')
        if (signal.aborted) throw new RawError('CANCELLED')
        const id = randomUUID() as WorkspaceId
        this.workspace = { id, root }
        return { status: 'opened', workspaceId: id }
      } catch (error) {
        throw this.filesystemError(error)
      } finally {
        this.opening = false
      }
    }
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    this.tasks.add(controller)
    const workspace = this.workspace
    const work = this.queue
      .catch(() => {})
      .then(async () => {
        if (controller.signal.aborted) throw new RawError('CANCELLED')
        if (!workspace || this.workspace !== workspace) throw new RawError('WORKSPACE_NOT_OPEN')
        return this.query(command, controller.signal)
      })
    this.queue = work
    try {
      return await work
    } finally {
      this.tasks.delete(controller)
      signal.removeEventListener('abort', abort)
    }
  }
  private requireWorkspace(id: WorkspaceId): { id: WorkspaceId; root: string } {
    if (!this.workspace || this.workspace.id !== id) throw new RawError('WORKSPACE_NOT_OPEN')
    return this.workspace
  }
  private filesystemError(error: unknown): RawError {
    if (error instanceof RawError) return error
    const code = (error as NodeJS.ErrnoException)?.code
    return new RawError(
      code === 'ENOENT' || code === 'ENOTDIR'
        ? 'NOT_FOUND'
        : code === 'EACCES' || code === 'EPERM'
          ? 'ACCESS_DENIED'
          : 'INTERNAL',
    )
  }
  private async resolve(source: SourceAddress): Promise<string> {
    const workspace = this.requireWorkspace(source.workspaceId)
    let path = workspace.root
    for (const component of source.relativePath.split('/')) {
      path = join(path, component)
      if ((await lstat(path)).isSymbolicLink()) throw new RawError('ACCESS_DENIED')
    }
    const resolved = await realpath(path)
    const contained = relative(workspace.root, resolved)
    if (
      contained === '' ||
      contained === '..' ||
      contained.startsWith('..' + sep) ||
      isAbsolute(contained)
    )
      throw new RawError('ACCESS_DENIED')
    if (!(await stat(resolved)).isFile()) throw new RawError('ACCESS_DENIED')
    return resolved
  }
  private async verify(source: Source): Promise<void> {
    if (source.stale) throw new RawError('SOURCE_CHANGED')
    try {
      const path = await this.resolve(source.address)
      if (path !== source.path || stamp(await stat(path, { bigint: true })) !== source.stamp)
        throw new RawError('SOURCE_CHANGED')
    } catch {
      this.invalidate(source)
      throw new RawError('SOURCE_CHANGED')
    }
  }
  private async source(address: SourceAddress, reload = false): Promise<Source> {
    this.requireWorkspace(address.workspaceId)
    const key = keyOf(address)
    const previous = this.sources.get(key)
    if (previous && !reload) {
      if (!previous.stale) await this.verify(previous).catch(() => {})
      return previous
    }
    if (!previous && this.sources.size >= RAW_LIMITS.sources)
      throw new RawError('RESOURCE_LIMIT', { limit: 'SOURCES' })
    if (previous) this.invalidate(previous)
    try {
      const path = await this.resolve(address)
      const meta = await stat(path, { bigint: true })
      if (meta.size > BigInt(Number.MAX_SAFE_INTEGER))
        throw new RawError('RESOURCE_LIMIT', { limit: 'SOURCE_SIZE' })
      const source: Source = {
        address,
        path,
        revision: randomUUID() as SourceRevision,
        stamp: stamp(meta),
        size: Number(meta.size),
        stale: false,
        validated: false,
        hash: null,
      }
      this.sources.set(key, source)
      const directory = dirname(path)
      if (!this.watchers.has(directory)) {
        try {
          const watcher = watch(directory, (_event, file) => {
            for (const known of this.sources.values())
              if (
                dirname(known.path) === directory &&
                (file === null || String(file) === basename(known.path))
              )
                this.invalidate(known)
          })
          watcher.on('error', () => {
            watcher.close()
            this.watchers.delete(directory)
          })
          this.watchers.set(directory, watcher)
        } catch {
          /* stat 验证与轮询仍保留。 */
        }
      }
      return source
    } catch (error) {
      throw this.filesystemError(error)
    }
  }
  private info(source: Source): SourceInfo {
    return {
      source: source.address,
      revision: source.revision,
      state: source.stale ? 'stale' : 'current',
      sizeBytes: source.size,
      validated: source.validated,
    }
  }
  private summary(node: ParsedNode, source: Source, truncated = true): NodeSummary {
    return {
      address: { source: source.address, pointer: node.pointer },
      revision: source.revision,
      kind: node.kind,
      range: node.range,
      childCount: node.childCount,
      preview: node.preview,
      truncated,
    }
  }
  private remember(node: ParsedNode, source: Source): void {
    const key = addressKey({ source: source.address, pointer: node.pointer }, source.revision)
    const bytes = byteSize([key, node])
    const previous = this.ranges.get(key)
    if (previous) {
      this.rangeBytes -= previous.bytes
      this.ranges.delete(key)
    }
    while (this.ranges.size && this.rangeBytes + bytes > RAW_LIMITS.cacheBytes) {
      const oldest = this.ranges.keys().next().value!
      this.rangeBytes -= this.ranges.get(oldest)!.bytes
      this.ranges.delete(oldest)
    }
    if (bytes <= RAW_LIMITS.cacheBytes) {
      this.ranges.set(key, { node, bytes })
      this.rangeBytes += bytes
    }
  }
  private putCursor(cursor: Cursor): string {
    while (this.cursors.size >= RAW_LIMITS.cursors)
      this.cursors.delete(this.cursors.keys().next().value!)
    const id = randomUUID()
    this.cursors.set(id, cursor)
    return id
  }
  private after(command: Extract<RawCommand, { kind: 'children' | 'segment' }>): number {
    if (!command.cursor) return command.kind === 'children' ? -1 : 0
    const cursor = this.cursors.get(command.cursor)
    if (
      !cursor ||
      cursor.kind !== command.kind ||
      cursor.revision !== command.expectedRevision ||
      addressKey(cursor.address, cursor.revision) !==
        addressKey(command.address, command.expectedRevision)
    )
      throw new RawError('STALE_CURSOR')
    return cursor.after
  }
  private async query(
    command: Exclude<RawCommand, { kind: 'open' } | { kind: 'close' }>,
    signal: AbortSignal,
  ): Promise<RawOutput> {
    const budget = new WorkBudget(signal)
    const source = await this.source(
      'source' in command ? command.source : command.address.source,
      command.kind === 'reload',
    )
    budget.check()
    if (command.kind === 'info' || command.kind === 'reload') return this.info(source)
    if (command.expectedRevision !== source.revision || source.stale)
      throw new RawError('SOURCE_CHANGED')
    const after = command.kind === 'read' ? -1 : this.after(command)
    await this.verify(source)
    const handle = await open(source.path, 'r').catch((error) => {
      this.invalidate(source)
      throw this.filesystemError(error)
    })
    try {
      if (stamp(await handle.stat({ bigint: true })) !== source.stamp) {
        this.invalidate(source)
        throw new RawError('SOURCE_CHANGED')
      }
      const cached = source.validated
        ? this.ranges.get(addressKey(command.address, source.revision))?.node
        : undefined
      let scan: ScanResult
      // 已验证巨大容器的摘要不需要再次遍历其完整子树。
      if (
        command.kind === 'read' &&
        cached &&
        cached.range.endByteExclusive - cached.range.startByte > RAW_LIMITS.valueBytes
      ) {
        scan = { node: cached, value: null, children: [], scalar: null, hash: null }
      } else {
        scan = await scanJson(
          handle,
          source.size,
          budget,
          {
            pointer: command.address.pointer,
            materialize: command.kind === 'read',
            childrenAfter: after,
            childrenLimit: command.kind === 'children' ? command.limit : undefined,
            scalar: command.kind === 'segment',
          },
          cached?.range ?? null,
          cached ? command.address.pointer : undefined,
        )
      }
      budget.check()
      await this.verify(source)
      if (stamp(await handle.stat({ bigint: true })) !== source.stamp) {
        this.invalidate(source)
        throw new RawError('SOURCE_CHANGED')
      }
      if (!source.validated) {
        source.validated = true
        source.hash = scan.hash
      }
      if (!scan.node) throw new RawError('NOT_FOUND')
      this.remember(scan.node, source)
      if (command.kind === 'read') {
        const node = this.summary(scan.node, source, !scan.value)
        const result: RawOutput = scan.value
          ? { mode: 'complete', node, value: scan.value }
          : { mode: 'summary', node }
        if (
          byteSize({ type: 'response', id: randomUUID(), result: { ok: true, value: result } }) >
          RAW_LIMITS.responseBytes
        )
          return { mode: 'summary', node: this.summary(scan.node, source) }
        return result
      }
      if (command.kind === 'children') {
        if (scan.node.kind !== 'object' && scan.node.kind !== 'array')
          throw new RawError('INVALID_INPUT')
        const result: ChildrenResult = {
          address: command.address,
          revision: source.revision,
          items: [],
          nextCursor: null,
          truncated: false,
        }
        for (const child of scan.children.slice(0, command.limit)) {
          const item = {
            ordinal: child.ordinal,
            key: child.key!,
            node: this.summary(child, source),
          }
          if (
            byteSize({ ...result, items: [...result.items, item] }) >
            RAW_LIMITS.responseBytes - 1024
          )
            break
          result.items.push(item)
          this.remember(child, source)
        }
        const last = result.items.at(-1)?.ordinal ?? after
        result.truncated = last + 1 < (scan.node.childCount ?? 0)
        if (result.truncated) {
          if (!result.items.length)
            throw new RawError('RESOURCE_LIMIT', { limit: 'RESPONSE_BYTES' })
          result.nextCursor = this.putCursor({
            address: command.address,
            revision: source.revision,
            kind: 'children',
            after: last,
          })
        }
        return result
      }
      if (scan.scalar?.kind !== 'string' && scan.scalar?.kind !== 'number')
        throw new RawError('INVALID_INPUT')
      const text = scan.scalar.kind === 'string' ? scan.scalar.value : scan.scalar.lexeme
      let offset = after,
        count = 0,
        segment = ''
      for (const point of text.slice(after)) {
        if (count++ >= command.limit) break
        segment += point
        offset += point.length
      }
      const truncated = offset < text.length
      return {
        address: command.address,
        revision: source.revision,
        kind: scan.scalar.kind,
        text: segment,
        truncated,
        nextCursor: truncated
          ? this.putCursor({
              address: command.address,
              revision: source.revision,
              kind: 'segment',
              after: offset,
            })
          : null,
      }
    } catch (error) {
      // 即使 parser 失败，也优先表达已经发现的 revision 变化。
      budget.check()
      await this.verify(source)
      if (error instanceof RawError) throw error
      throw this.filesystemError(error)
    } finally {
      await handle.close()
      this.observe?.({ bytesRead: budget.bytes, tokens: budget.tokens })
      budget.check()
      await this.verify(source)
      budget.check()
    }
  }
}
