import { randomUUID } from 'node:crypto'
import { lstat, opendir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { setImmediate as yieldTurn } from 'node:timers/promises'
import {
  byteSize,
  compareDirectoryEntries,
  DIRECTORY_LIMITS,
  RAW_LIMITS,
  RawError,
  validDirectoryPath,
  validPath,
} from '../shared/raw'
import type {
  DirectoryEntry,
  DirectoryPath,
  DirectoryResult,
  RawCommand,
  WorkspaceId,
} from '../shared/raw'
import { resolveRawPath, statStamp } from './raw-filesystem'

type Snapshot = {
  id: string
  generation: number
  directory: DirectoryPath
  stamp: string
  items: DirectoryEntry[]
  bytes: number
  expires: number
}
type Cursor = { snapshotId: string; offset: number }
export class RawDirectory {
  constructor(
    private readonly limits: {
      readonly [Key in keyof typeof DIRECTORY_LIMITS]: number
    } = DIRECTORY_LIMITS,
    private readonly responseBytes = RAW_LIMITS.responseBytes,
  ) {}
  private snapshots = new Map<string, Snapshot>()
  private cursors = new Map<string, Cursor>()
  private bytes = 0
  clear(): void {
    this.snapshots.clear()
    this.cursors.clear()
    this.bytes = 0
  }
  private remove(id: string): void {
    const snapshot = this.snapshots.get(id)
    if (!snapshot) return
    this.bytes -= snapshot.bytes
    this.snapshots.delete(id)
    for (const [cursorId, cursor] of this.cursors)
      if (cursor.snapshotId === id) this.cursors.delete(cursorId)
  }
  private expire(): void {
    for (const [id, snapshot] of this.snapshots)
      if (snapshot.expires <= performance.now()) this.remove(id)
  }
  async list(
    command: Extract<RawCommand, { kind: 'directory' }>,
    workspace: { id: WorkspaceId; root: string; generation: number },
    guard: () => void,
  ): Promise<DirectoryResult> {
    const started = performance.now()
    const check = (): void => {
      guard()
      if (performance.now() - started > this.limits.workMs)
        throw new RawError('RESOURCE_LIMIT', { limit: 'DIRECTORY_WORK_MS' })
    }
    check()
    this.expire()
    let snapshot: Snapshot | undefined
    let offset = 0
    if (command.cursor) {
      const cursor = this.cursors.get(command.cursor)
      snapshot = cursor && this.snapshots.get(cursor.snapshotId)
      if (
        !snapshot ||
        snapshot.generation !== workspace.generation ||
        snapshot.directory !== command.directory
      )
        throw new RawError('STALE_CURSOR')
      offset = cursor!.offset
    }
    const path = await resolveRawPath(workspace.root, command.directory, true, check)
    const before = statStamp(await stat(path, { bigint: true }))
    check()
    if (snapshot) {
      if (
        snapshot.stamp !== before ||
        snapshot.expires <= performance.now() ||
        !this.snapshots.has(snapshot.id)
      ) {
        this.remove(snapshot.id)
        throw new RawError('STALE_CURSOR')
      }
    } else {
      const items: DirectoryEntry[] = []
      let scanned = 0
      let bytes = byteSize({ directory: command.directory, items: [] }) + 256
      const handle = await opendir(path)
      try {
        check()
        for (;;) {
          const entry = await handle.read()
          check()
          if (!entry) break
          if (++scanned > this.limits.scan)
            throw new RawError('RESOURCE_LIMIT', { limit: 'DIRECTORY_SCAN' })
          // lstat 复核 child，避免 dirent 变成 link 后仍被当作普通 source。
          const meta = await lstat(join(path, entry.name)).catch(
            async (error: NodeJS.ErrnoException) => {
              if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
              // child 消失是分页 stream 变化；只有目录自身消失才返回 NOT_FOUND。
              await resolveRawPath(workspace.root, command.directory, true, check)
              throw new RawError('STALE_CURSOR')
            },
          )
          check()
          if (
            !meta.isSymbolicLink() &&
            (meta.isDirectory() || (meta.isFile() && entry.name.endsWith('.json')))
          ) {
            const relative = command.directory ? command.directory + '/' + entry.name : entry.name
            if (byteSize(relative) > RAW_LIMITS.addressBytes)
              throw new RawError('RESOURCE_LIMIT', { limit: 'ADDRESS_BYTES' })
            if (!validDirectoryPath(relative) || (meta.isFile() && !validPath(relative)))
              throw new RawError('ACCESS_DENIED')
            let item: DirectoryEntry
            if (meta.isDirectory()) item = { kind: 'directory', name: entry.name, path: relative }
            else {
              if (!validPath(relative)) throw new RawError('ACCESS_DENIED')
              item = {
                kind: 'source',
                name: entry.name,
                source: { workspaceId: workspace.id, relativePath: relative },
              }
            }
            bytes += byteSize(item) + 1
            if (bytes > this.limits.snapshotBytes)
              throw new RawError('RESOURCE_LIMIT', { limit: 'DIRECTORY_SNAPSHOT_BYTES' })
            items.push(item)
          }
          if (scanned % this.limits.yieldEvery === 0) {
            await yieldTurn()
            check()
          }
        }
      } finally {
        await handle.close()
      }
      check()
      const currentPath = await resolveRawPath(workspace.root, command.directory, true, check)
      const after = statStamp(await stat(currentPath, { bigint: true }))
      check()
      if (currentPath !== path || after !== before) throw new RawError('STALE_CURSOR')
      items.sort(compareDirectoryEntries)
      check()
      snapshot = {
        id: randomUUID(),
        generation: workspace.generation,
        directory: command.directory,
        stamp: before,
        items,
        bytes,
        expires: performance.now() + this.limits.ttlMs,
      }
      this.expire()
      if (bytes > this.limits.cacheBytes)
        throw new RawError('RESOURCE_LIMIT', { limit: 'DIRECTORY_CACHE_BYTES' })
      while (
        this.snapshots.size >= this.limits.snapshots ||
        this.bytes + bytes > this.limits.cacheBytes
      )
        this.remove(this.snapshots.keys().next().value!)
      this.snapshots.set(snapshot.id, snapshot)
      this.bytes += bytes
    }
    const result: DirectoryResult = {
      workspaceId: workspace.id,
      directory: command.directory,
      items: [],
      nextCursor: null,
      truncated: false,
    }
    const cursorId = randomUUID()
    for (const item of snapshot.items.slice(offset, offset + command.limit)) {
      const more = offset + result.items.length + 1 < snapshot.items.length
      const candidate = {
        ...result,
        items: [...result.items, item],
        nextCursor: more ? cursorId : null,
        truncated: more,
      }
      if (
        byteSize({ type: 'response', id: randomUUID(), result: { ok: true, value: candidate } }) >
        this.responseBytes
      )
        break
      result.items.push(item)
    }
    check()
    offset += result.items.length
    result.truncated = offset < snapshot.items.length
    if (result.truncated) {
      if (!result.items.length) throw new RawError('RESOURCE_LIMIT', { limit: 'RESPONSE_BYTES' })
      while (this.cursors.size >= this.limits.cursors)
        this.cursors.delete(this.cursors.keys().next().value!)
      this.cursors.set(cursorId, { snapshotId: snapshot.id, offset })
      result.nextCursor = cursorId
    }
    return result
  }
}
