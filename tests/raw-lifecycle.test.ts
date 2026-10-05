import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { RawDataService } from '../src/utility/raw-service'
import { RawDirectory } from '../src/utility/raw-directory'
import * as parser from '../src/utility/raw-parser'
import { RAW_LIMITS, RawError } from '../src/shared/raw'
import type {
  ChildrenResult,
  DirectoryPath,
  DirectoryResult,
  JsonPointer,
  RelativePath,
  SourceInfo,
  WorkspaceId,
} from '../src/shared/raw'

let root: string, service: RawDataService, workspaceId: WorkspaceId
const signal = () => new AbortController().signal
const source = (file = 'a.json') => ({ workspaceId, relativePath: file as RelativePath })
const info = async (file = 'a.json') =>
  (await service.execute({ kind: 'info', source: source(file) }, signal())) as SourceInfo
const release = (file = 'a.json') =>
  service.execute({ kind: 'release', source: source(file) }, signal())
const read = (metadata: SourceInfo, inputSignal = signal()) =>
  service.execute(
    {
      kind: 'read',
      address: { source: metadata.source, pointer: '' as JsonPointer },
      expectedRevision: metadata.revision,
    },
    inputSignal,
  )
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'refatlas-lifecycle-'))
  await writeFile(join(root, 'a.json'), '[' + '0,'.repeat(200000) + '0]')
  await writeFile(join(root, 'b.json'), '[1,2,3]')
  service = new RawDataService()
  const opened = (await service.execute({ kind: 'open', root }, signal())) as {
    workspaceId: WorkspaceId
  }
  workspaceId = opened.workspaceId
  // Source-only fault injection must not overlap the independent startup traversal.
  while (
    (
      (await service.execute(
        { kind: 'locate', workspaceId, query: '', limit: 1, catalogGeneration: null },
        signal(),
      )) as { status: string }
    ).status === 'building'
  )
    await new Promise<void>((resolve) => setImmediate(resolve))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await service.execute({ kind: 'close', workspaceId }, signal()).catch(() => {})
  service.dispose()
  await rm(root, { recursive: true, force: true })
})
describe('active source lifecycle', () => {
  it('keeps metadata within the original work budget and rolls back an expired candidate', async () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const target = service as unknown as { acquire: (...args: unknown[]) => Promise<unknown> }
    const original = target.acquire.bind(service)
    vi.spyOn(target, 'acquire').mockImplementationOnce(async (...args) => {
      const value = await original(...args)
      now = RAW_LIMITS.workMs + 1
      return value
    })
    await expect(info()).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT',
      details: { limit: 'WORK_MS' },
    })
    expect(await release()).toEqual({ released: false })
  })
  it('does not republish validated metadata after a late watcher invalidation', async () => {
    const b = await info('b.json')
    const target = service as unknown as {
      verify: (source: unknown) => Promise<void>
      invalidate: (source: unknown) => void
    }
    const original = target.verify.bind(service)
    let checks = 0
    vi.spyOn(target, 'verify').mockImplementation(async (source) => {
      await original(source)
      if (++checks === 2) target.invalidate(source)
    })
    await expect(read(b)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    expect(await info('b.json')).toMatchObject({ state: 'stale', validated: false })
  })
  it('does not exceed the source cap when metadata acquisitions race for the last slot', async () => {
    for (let i = 0; i < RAW_LIMITS.sources + 1; i++) await writeFile(join(root, i + '.json'), '0')
    for (let i = 0; i < RAW_LIMITS.sources - 1; i++) await info(i + '.json')
    const results = await Promise.allSettled([
      info(RAW_LIMITS.sources - 1 + '.json'),
      info(RAW_LIMITS.sources + '.json'),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).lengthOf(1)
    const failure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
    expect(failure.reason).toMatchObject({ code: 'RESOURCE_LIMIT', details: { limit: 'SOURCES' } })
    await release('0.json')
    expect(await info('a.json')).toMatchObject({ state: 'current' })
  })
  it('explicitly acquires, releases current/stale sources and rejects implicit reacquisition', async () => {
    expect(await release()).toEqual({ released: false })
    const old = await info()
    expect(await release()).toEqual({ released: true })
    expect(await release()).toEqual({ released: false })
    await expect(read(old)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    const fresh = await info()
    expect(fresh.revision).not.toBe(old.revision)
    await writeFile(join(root, 'a.json'), '[4]')
    expect((await info()).state).toBe('stale')
    expect(await release()).toEqual({ released: true })
    await expect(
      service.execute(
        { kind: 'release', source: { ...source(), workspaceId: randomUUID() as WorkspaceId } },
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_OPEN' })
  })
  it('cleans post-registration cancellation without deleting a previously delivered source', async () => {
    // 只在测试内拦截 acquisition 完成边界，不新增 packaged diagnostics API。
    const target = service as unknown as { acquire: (...args: unknown[]) => Promise<unknown> }
    const original = target.acquire.bind(service)
    const controller = new AbortController()
    const hook = vi.spyOn(target, 'acquire').mockImplementationOnce(async (...args) => {
      const result = await original(...args)
      controller.abort()
      return result
    })
    await expect(
      service.execute({ kind: 'info', source: source() }, controller.signal),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(await release()).toEqual({ released: false })
    hook.mockRestore()
    const existing = await info()
    const existingController = new AbortController()
    vi.spyOn(target, 'acquire').mockImplementationOnce(async (...args) => {
      const result = await original(...args)
      existingController.abort()
      return result
    })
    await expect(
      service.execute({ kind: 'info', source: source() }, existingController.signal),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect((await info()).revision).toBe(existing.revision)
    expect(await release()).toEqual({ released: true })
  })
  it('lets a queued same-address acquire succeed after the cancelled candidate has fully rolled back', async () => {
    const target = service as unknown as { acquire: (...args: unknown[]) => Promise<unknown> }
    const original = target.acquire.bind(service)
    const controller = new AbortController()
    vi.spyOn(target, 'acquire').mockImplementationOnce(async (...args) => {
      const result = await original(...args)
      controller.abort()
      return result
    })
    const cancelled = service
      .execute({ kind: 'info', source: source('b.json') }, controller.signal)
      .catch((error) => error.code)
    const queued = info('b.json')
    expect(await cancelled).toBe('CANCELLED')
    const current = await queued
    expect(await read(current)).toMatchObject({ mode: 'complete' })
    expect(await release('b.json')).toEqual({ released: true })
  })
  it('releases targeted active/queued work while unrelated metadata and directory work finish during a scan', async () => {
    const a = await info(),
      b = await info('b.json')
    const entered = deferred()
    const original = parser.scanJson
    const scan = vi.spyOn(parser, 'scanJson').mockImplementationOnce(async (...args) => {
      entered.resolve()
      await new Promise<void>((_resolve, reject) => {
        args[2].signal.addEventListener('abort', () => reject(new RawError('CANCELLED')), {
          once: true,
        })
      })
      return original(...args)
    })
    const active = read(a).catch((error) => error.code)
    await entered.promise
    const queued = read(a).catch((error) => error.code)
    expect((await info('b.json')).revision).toBe(b.revision)
    expect((await info('b.json')).validated).toBe(false)
    const directory = (await service.execute(
      { kind: 'directory', workspaceId, directory: '' as DirectoryPath, limit: 200, cursor: null },
      signal(),
    )) as DirectoryResult
    expect(directory.items.length).toBe(2)
    expect(scan).toHaveBeenCalledTimes(1)
    const unrelated = read(b)
    expect(await release()).toEqual({ released: true })
    expect(await active).toBe('CANCELLED')
    expect(await queued).toBe('CANCELLED')
    expect(await unrelated).toMatchObject({ mode: 'complete' })
    await expect(read(a)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  })
  it('waits for retiring handles and protects a new same-address acquisition from old cleanup', async () => {
    const old = await info()
    const entered = deferred(),
      aborted = deferred(),
      cleanup = deferred()
    const original = parser.scanJson
    vi.spyOn(parser, 'scanJson').mockImplementationOnce(async (...args) => {
      entered.resolve()
      await new Promise<void>((resolve) =>
        args[2].signal.addEventListener(
          'abort',
          () => {
            aborted.resolve()
            resolve()
          },
          { once: true },
        ),
      )
      await cleanup.promise
      args[2].check()
      return original(...args)
    })
    const active = read(old).catch((error) => error.code)
    await entered.promise
    const retiring = release()
    await aborted.promise
    let acquired = false
    const fresh = info().then((value) => {
      acquired = true
      return value
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(acquired).toBe(false)
    cleanup.resolve()
    expect(await active).toBe('CANCELLED')
    expect(await retiring).toEqual({ released: true })
    const current = await fresh
    expect(current.revision).not.toBe(old.revision)
    await expect(read(old)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    expect(await read(current)).toMatchObject({ mode: 'summary' })
  })
  it('revalidates watcher hints without staling an unchanged registration', async () => {
    const current = await info('b.json')
    await read(current)
    const internal = service as unknown as {
      watchers: Map<string, { handle: FSWatcher }>
      invalidate: (source: unknown) => void
    }
    const watcher = [...internal.watchers.values()][0].handle
    // 延迟通知本身不能证明当前 registration 的文件已改变。
    watcher.emit('change', 'rename', 'b.json')
    expect(await read(current)).toMatchObject({ mode: 'complete' })
    expect(await info('b.json')).toMatchObject({ state: 'current', validated: true })
    const changed = deferred()
    const invalidate = internal.invalidate.bind(service)
    vi.spyOn(internal, 'invalidate').mockImplementation((source) => {
      invalidate(source)
      changed.resolve()
    })
    await writeFile(join(root, 'b.json'), '[4,5,6]')
    watcher.emit('change', 'change', 'b.json')
    await changed.promise
    await expect(read(current)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  })
  it('retains unrelated ranges/cursors and shares watcher ownership through reload and release', async () => {
    const a = await info(),
      b = await info('b.json')
    await read(b)
    const pageCommand = {
      kind: 'children' as const,
      address: { source: b.source, pointer: '' as JsonPointer },
      expectedRevision: b.revision,
      limit: 1,
      cursor: null,
    }
    const page = (await service.execute(pageCommand, signal())) as ChildrenResult
    // 有限测试资源观察：没有桥接给 Renderer 或普通 packaged product。
    const watcher = [
      ...(
        service as unknown as { watchers: Map<string, { handle: { close: () => void } }> }
      ).watchers.values(),
    ][0]
    const close = vi.spyOn(watcher.handle, 'close')
    const reload = (await service.execute(
      { kind: 'reload', source: a.source },
      signal(),
    )) as SourceInfo
    expect(reload.revision).not.toBe(a.revision)
    expect(close).not.toHaveBeenCalled()
    const scan = vi.spyOn(parser, 'scanJson')
    await release()
    expect(close).not.toHaveBeenCalled()
    await read(b)
    expect(scan.mock.calls.at(-1)![4]).not.toBeNull()
    expect(
      (
        (await service.execute(
          { ...pageCommand, cursor: page.nextCursor },
          signal(),
        )) as ChildrenResult
      ).items[0].ordinal,
    ).toBe(1)
    expect(await release('b.json')).toEqual({ released: true })
    expect(close).toHaveBeenCalledTimes(1)
    const reacquired = await info('b.json')
    await expect(
      service.execute(
        { ...pageCommand, expectedRevision: reacquired.revision, cursor: page.nextCursor },
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'STALE_CURSOR' })
  })
  it('completes retirement even if the release caller cancels', async () => {
    await info()
    const controller = new AbortController()
    const pending = service
      .execute({ kind: 'release', source: source() }, controller.signal)
      .catch((error) => error.code)
    controller.abort()
    expect(await pending).toBe('CANCELLED')
    expect(await release()).toEqual({ released: false })
  })
})
describe('bounded metadata scheduling and workspace barriers', () => {
  it('runs two directories, cancels the queued third and drains old work before reopening', async () => {
    await mkdir(join(root, 'nested'))
    const entered = deferred(),
      gate = deferred()
    let active = 0,
      maximum = 0,
      calls = 0
    const original = RawDirectory.prototype.list
    vi.spyOn(RawDirectory.prototype, 'list').mockImplementation(async function (
      this: RawDirectory,
      ...args
    ) {
      calls++
      maximum = Math.max(maximum, ++active)
      if (active === 2) entered.resolve()
      try {
        await gate.promise
        return await original.apply(this, args)
      } finally {
        active--
      }
    })
    const command = {
      kind: 'directory' as const,
      workspaceId,
      directory: '' as DirectoryPath,
      limit: 200,
      cursor: null,
    }
    const first = service.execute(command, signal()).catch((error) => error.code)
    const second = service.execute(command, signal()).catch((error) => error.code)
    await entered.promise
    const controller = new AbortController()
    const third = service.execute(command, controller.signal).catch((error) => error.code)
    controller.abort()
    expect(await third).toBe('CANCELLED')
    expect(calls).toBe(2)
    let reopened = false
    const oldId = workspaceId
    const opening = service.execute({ kind: 'open', root }, signal()).then((result) => {
      reopened = true
      return result as { workspaceId: WorkspaceId }
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(reopened).toBe(false)
    gate.resolve()
    expect(await first).toBe('CANCELLED')
    expect(await second).toBe('CANCELLED')
    workspaceId = (await opening).workspaceId
    expect(workspaceId).not.toBe(oldId)
    expect(maximum).toBe(2)
    expect(
      ((await service.execute({ ...command, workspaceId }, signal())) as DirectoryResult).items
        .length,
    ).toBe(3)
  })
})
