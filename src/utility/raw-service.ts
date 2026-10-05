import { randomUUID } from 'node:crypto'
import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, parse } from 'node:path'
import { byteSize, DIRECTORY_LIMITS, RAW_LIMITS, RawError, validCommand } from '../shared/raw'
import { LIMITS } from '../shared/protocol'
import { filesystemError, resolveRawPath, statStamp as stamp } from './raw-filesystem'
import { RawDirectory } from './raw-directory'
import { RawScheduler } from './raw-scheduler'
import { RawSourceCatalog } from './raw-source-catalog'
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
  token: symbol
  retiring: boolean
  delivered: boolean
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
type CacheEntry = { node: ParsedNode; bytes: number; sourceKey: string; token: symbol }
type Workspace = { id: WorkspaceId; root: string; generation: number }
type Task = {
  kind: RawCommand['kind']
  workspace: Workspace
  controller: AbortController
  sourceKey: string | null
  source?: Source
  created?: Source
  budget?: WorkBudget
  done: Promise<void>
  finish: () => void
}
type Watcher = { handle: FSWatcher; owners: Set<Source>; pending: Set<Source> }
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
  private workspace: Workspace | null = null
  private generation = 0
  private sources = new Map<string, Source>()
  private watchers = new Map<string, Watcher>()
  private ranges = new Map<string, CacheEntry>()
  private rangeBytes = 0
  private cursors = new Map<string, Cursor>()
  private tasks = new Set<Task>()
  private parserQueue = new RawScheduler(1)
  private metadataQueue = new RawScheduler(DIRECTORY_LIMITS.concurrency)
  private controls = new Map<string, Promise<unknown>>()
  private directories = new RawDirectory()
  private polling = false
  private opening = false
  private timer: ReturnType<typeof setInterval>
  constructor(
    private readonly observe?: (work: { bytesRead: number; tokens: number }) => void,
    private readonly catalog = new RawSourceCatalog(),
  ) {
    this.timer = setInterval(() => {
      void this.poll()
    }, 1000)
    this.timer.unref()
  }
  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      for (const source of [...this.sources.values()])
        if (this.current(source) && source.delivered && !source.stale)
          await this.verify(source).catch(() => {})
    } finally {
      this.polling = false
    }
  }
  private invalidate(source: Source): void {
    if (!this.current(source)) return
    source.stale = true
    source.validated = false
    source.hash = null
    // 文件级失效；所有访问缓存均是可重建的，初版保守清空。
    this.ranges.clear()
    this.rangeBytes = 0
    for (const [id, cursor] of this.cursors)
      if (keyOf(cursor.address.source) === keyOf(source.address)) this.cursors.delete(id)
  }
  private reset(): Promise<void> {
    ++this.generation
    this.workspace = null
    const tasks = [...this.tasks]
    for (const task of tasks) task.controller.abort()
    for (const source of this.sources.values()) source.retiring = true
    for (const watcher of this.watchers.values()) watcher.handle.close()
    this.watchers.clear()
    this.sources.clear()
    this.ranges.clear()
    this.rangeBytes = 0
    this.cursors.clear()
    this.directories.clear()
    return Promise.all([this.catalog.clear(), ...tasks.map((task) => task.done)]).then(() => {})
  }
  dispose(): void {
    clearInterval(this.timer)
    void this.reset()
  }
  // publish 同步完成 Utility 的最后取消检查与成功 reply，避免交付前取消留下 candidate。
  async execute(
    command: RawCommand,
    signal: AbortSignal,
    publish?: (value: RawOutput) => void,
  ): Promise<RawOutput> {
    if (!validCommand(command)) throw new RawError('INVALID_INPUT')
    if (signal.aborted) throw new RawError('CANCELLED')
    if (command.kind === 'close') {
      this.requireWorkspace(command.workspaceId)
      await this.reset()
      if (signal.aborted) throw new RawError('CANCELLED')
      const value = { closed: true as const }
      publish?.(value)
      return value
    }
    if (command.kind === 'open') {
      if (this.opening) throw new RawError('BUSY')
      this.opening = true
      try {
        await this.reset()
        const generation = this.generation
        if (!isAbsolute(command.root)) throw new RawError('INVALID_INPUT')
        const root = await realpath(command.root)
        if (!(await stat(root)).isDirectory()) throw new RawError('INVALID_INPUT')
        if (signal.aborted || generation !== this.generation) throw new RawError('CANCELLED')
        const displayName = root === parse(root).root ? '' : basename(root)
        if (byteSize(displayName) > RAW_LIMITS.addressBytes)
          throw new RawError('RESOURCE_LIMIT', { limit: 'ADDRESS_BYTES' })
        const id = randomUUID() as WorkspaceId
        this.workspace = { id, root, generation }
        this.catalog.rebuild(this.workspace)
        const value = { status: 'opened' as const, workspaceId: id, displayName }
        publish?.(value)
        return value
      } catch (error) {
        throw filesystemError(error)
      } finally {
        this.opening = false
      }
    }
    const workspace = this.requireWorkspace(
      command.kind === 'directory' || command.kind === 'locate' || command.kind === 'catalog'
        ? command.workspaceId
        : 'source' in command
          ? command.source.workspaceId
          : command.address.source.workspaceId,
    )
    if (this.tasks.size >= LIMITS.pending) throw new RawError('BUSY')
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    let finish!: () => void
    const task: Task = {
      kind: command.kind,
      workspace,
      controller,
      sourceKey:
        command.kind === 'directory' || command.kind === 'locate' || command.kind === 'catalog'
          ? null
          : keyOf('source' in command ? command.source : command.address.source),
      done: new Promise<void>((resolve) => {
        finish = resolve
      }),
      finish: () => finish(),
    }
    this.tasks.add(task)
    try {
      let value: RawOutput
      if (command.kind === 'directory')
        value = await this.metadataQueue.run(controller.signal, () =>
          this.directories.list(command, workspace, () => this.check(task)),
        )
      else if (command.kind === 'locate')
        value = await this.catalog.locate(command, () => this.check(task))
      else if (command.kind === 'catalog') value = this.catalog.rebuild(workspace)
      else if (command.kind === 'release') {
        const source = this.sources.get(task.sourceKey!)
        const released = Boolean(source && !source.retiring && source.delivered)
        if (source) source.retiring = true
        const oldTasks = this.abortSource(task.sourceKey!, task)
        value = await this.control(task, async () => {
          await Promise.all(oldTasks.map((old) => old.done))
          if (source) this.drop(source)
          return { released }
        })
      } else if (command.kind === 'info' || command.kind === 'reload')
        value = await this.control(task, () =>
          this.metadataQueue.run(controller.signal, async () => {
            task.budget = new WorkBudget(controller.signal)
            this.check(task)
            if (command.kind === 'reload') {
              const previous = this.sources.get(task.sourceKey!)
              if (previous) {
                previous.retiring = true
                const oldTasks = this.abortSource(task.sourceKey!, task, previous)
                await Promise.all(oldTasks.map((old) => old.done))
                this.drop(previous)
              }
            }
            this.check(task)
            const source = await this.acquire(command.source, task)
            task.source = source
            return this.info(source)
          }),
        )
      else {
        const source = this.sources.get(task.sourceKey!)
        if (!source || !source.delivered || !this.current(source))
          throw new RawError('SOURCE_CHANGED')
        task.source = source
        value = await this.parserQueue.run(controller.signal, () => this.query(command, task))
      }
      this.check(task)
      if (task.source && !this.current(task.source)) throw new RawError('SOURCE_CHANGED')
      publish?.(value)
      if (task.created) task.created.delivered = true
      return value
    } catch (error) {
      if (task.created && !task.created.delivered) this.drop(task.created)
      throw filesystemError(error)
    } finally {
      this.tasks.delete(task)
      task.finish()
      signal.removeEventListener('abort', abort)
    }
  }
  private requireWorkspace(id: WorkspaceId): Workspace {
    if (!this.workspace || this.workspace.id !== id) throw new RawError('WORKSPACE_NOT_OPEN')
    return this.workspace
  }
  private check(task: Task): void {
    task.budget?.check()
    if (
      task.controller.signal.aborted ||
      this.workspace !== task.workspace ||
      task.workspace.generation !== this.generation
    )
      throw new RawError('CANCELLED')
    if (task.source && !this.current(task.source)) throw new RawError('SOURCE_CHANGED')
    if (task.source?.stale && ['read', 'children', 'segment'].includes(task.kind))
      throw new RawError('SOURCE_CHANGED')
  }
  private current(source: Source): boolean {
    return (
      !source.retiring &&
      this.workspace?.id === source.address.workspaceId &&
      this.sources.get(keyOf(source.address)) === source
    )
  }
  private abortSource(key: string, except: Task, source?: Source): Task[] {
    const tasks = [...this.tasks].filter(
      (task) =>
        task !== except &&
        task.sourceKey === key &&
        task.kind !== 'release' &&
        (!source || task.source === source),
    )
    for (const task of tasks) task.controller.abort()
    return tasks
  }
  private control<T>(task: Task, action: () => Promise<T>): Promise<T> {
    const key = task.sourceKey!
    const previous = this.controls.get(key) ?? Promise.resolve()
    const work = previous.catch(() => {}).then(action)
    // 下一个控制操作等待 execute 的 commit/rollback/finally，而不仅是 metadata action。
    const tail = work.then(
      () => task.done,
      () => task.done,
    )
    this.controls.set(key, tail)
    void tail
      .finally(() => {
        if (this.controls.get(key) === tail) this.controls.delete(key)
      })
      .catch(() => {})
    return work
  }
  private drop(source: Source): void {
    source.retiring = true
    const key = keyOf(source.address)
    if (this.sources.get(key) === source) this.sources.delete(key)
    for (const [cacheKey, entry] of this.ranges)
      if (entry.sourceKey === key && entry.token === source.token) {
        this.ranges.delete(cacheKey)
        this.rangeBytes -= entry.bytes
      }
    for (const [id, cursor] of this.cursors)
      if (keyOf(cursor.address.source) === key && cursor.revision === source.revision)
        this.cursors.delete(id)
    const directory = dirname(source.path)
    const watcher = this.watchers.get(directory)
    watcher?.owners.delete(source)
    if (watcher && !watcher.owners.size) {
      watcher.handle.close()
      if (this.watchers.get(directory) === watcher) this.watchers.delete(directory)
    }
  }
  private async verify(source: Source): Promise<void> {
    const check = (): void => {
      if (!this.current(source) || source.stale) throw new RawError('SOURCE_CHANGED')
    }
    check()
    if (source.stale) throw new RawError('SOURCE_CHANGED')
    try {
      const workspace = this.requireWorkspace(source.address.workspaceId)
      const path = await resolveRawPath(workspace.root, source.address.relativePath, false, check)
      if (path !== source.path || stamp(await stat(path, { bigint: true })) !== source.stamp)
        throw new RawError('SOURCE_CHANGED')
      check()
    } catch {
      this.invalidate(source)
      throw new RawError('SOURCE_CHANGED')
    }
  }
  private async acquire(address: SourceAddress, task: Task): Promise<Source> {
    const key = keyOf(address)
    const previous = this.sources.get(key)
    if (previous && this.current(previous)) {
      if (!previous.stale) await this.verify(previous).catch(() => {})
      return previous
    }
    if (!previous && this.sources.size >= RAW_LIMITS.sources)
      throw new RawError('RESOURCE_LIMIT', { limit: 'SOURCES' })
    try {
      const path = await resolveRawPath(task.workspace.root, address.relativePath, false, () =>
        this.check(task),
      )
      const meta = await stat(path, { bigint: true })
      this.check(task)
      // 两个 metadata 槽可能同时通过初始检查；发布 registration 前重新核实容量。
      if (!this.sources.has(key) && this.sources.size >= RAW_LIMITS.sources)
        throw new RawError('RESOURCE_LIMIT', { limit: 'SOURCES' })
      if (meta.size > BigInt(Number.MAX_SAFE_INTEGER))
        throw new RawError('RESOURCE_LIMIT', { limit: 'SOURCE_SIZE' })
      const source: Source = {
        token: Symbol(),
        retiring: false,
        delivered: false,
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
      task.created = source
      const directory = dirname(path)
      if (!this.watchers.has(directory)) {
        try {
          const watcher: Watcher = {
            handle: watch(directory, (_event, file) => {
              if (this.watchers.get(directory) !== watcher) return
              for (const known of watcher.owners)
                if (
                  dirname(known.path) === directory &&
                  (file === null || String(file) === basename(known.path)) &&
                  !known.stale &&
                  !watcher.pending.has(known)
                ) {
                  // 通知可能迟到或重复；只按当前 registration 的路径/stat 失效。
                  watcher.pending.add(known)
                  void this.verify(known)
                    .catch(() => {})
                    .finally(() => watcher.pending.delete(known))
                }
            }),
            owners: new Set(),
            pending: new Set(),
          }
          watcher.handle.on('error', () => {
            watcher.handle.close()
            if (this.watchers.get(directory) === watcher) this.watchers.delete(directory)
          })
          this.watchers.set(directory, watcher)
        } catch {
          /* stat 验证与轮询仍保留。 */
        }
      }
      this.watchers.get(directory)?.owners.add(source)
      return source
    } catch (error) {
      throw filesystemError(error)
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
    if (!this.current(source)) throw new RawError('SOURCE_CHANGED')
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
      this.ranges.set(key, { node, bytes, sourceKey: keyOf(source.address), token: source.token })
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
    command: Extract<RawCommand, { kind: 'read' } | { kind: 'children' | 'segment' }>,
    task: Task,
  ): Promise<RawOutput> {
    this.check(task)
    const budget = new WorkBudget(task.controller.signal)
    const source = task.source!
    budget.check()
    if (command.expectedRevision !== source.revision || source.stale)
      throw new RawError('SOURCE_CHANGED')
    const after = command.kind === 'read' ? -1 : this.after(command)
    await this.verify(source)
    this.check(task)
    const handle = await open(source.path, 'r').catch((error) => {
      this.invalidate(source)
      throw filesystemError(error)
    })
    try {
      this.check(task)
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
      this.check(task)
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
      this.check(task)
      await this.verify(source)
      if (error instanceof RawError) throw error
      throw filesystemError(error)
    } finally {
      await handle.close()
      this.observe?.({ bytesRead: budget.bytes, tokens: budget.tokens })
      budget.check()
      this.check(task)
      await this.verify(source)
      budget.check()
    }
  }
}
