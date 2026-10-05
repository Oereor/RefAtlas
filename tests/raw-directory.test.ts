import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import * as filesystem from 'node:fs/promises'
import { RawDataService } from '../src/utility/raw-service'
import { RawDirectory } from '../src/utility/raw-directory'
import {
  byteSize,
  compareDirectoryEntries,
  DIRECTORY_LIMITS,
  RAW_LIMITS,
  validCommand,
  validDirectoryPath,
  validRawResult,
  splitPointer,
  joinPointer,
  parentPointer,
} from '../src/shared/raw'
import type { DirectoryPath, DirectoryResult, RawCommand, WorkspaceId } from '../src/shared/raw'

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}))

let root: string, service: RawDataService, workspaceId: WorkspaceId
const signal = () => new AbortController().signal
const command = (directory = '', limit = 200, cursor: string | null = null) => ({
  kind: 'directory' as const,
  workspaceId,
  directory: directory as DirectoryPath,
  limit,
  cursor,
})
const list = async (directory = '', limit = 200, cursor: string | null = null) =>
  (await service.execute(command(directory, limit, cursor), signal())) as DirectoryResult
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'refatlas-directory-'))
  service = new RawDataService()
  const opened = await service.execute({ kind: 'open', root }, signal())
  expect(opened).toMatchObject({ status: 'opened', displayName: root.split(/[\\/]/).at(-1) })
  workspaceId = (opened as { workspaceId: WorkspaceId }).workspaceId
  // Finish eager catalog discovery before injecting single-directory filesystem failures.
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
describe('directory and Pointer contracts', () => {
  it.each(['', 'ExcelOutput', 'Config/层级', 'a b/😀'])('accepts %j', (path) =>
    expect(validDirectoryPath(path)).toBe(true),
  )
  it.each([
    '/a',
    'C:/a',
    '//server/share',
    'a\\b',
    'a:b',
    'a\0b',
    '.',
    '..',
    'a/./b',
    'a/../b',
    'a//b',
    'a/',
    '界'.repeat(2000),
  ])('rejects %j', (path) => expect(validDirectoryPath(path)).toBe(false))
  it('preserves empty, escaped, Unicode and numeric-looking Pointer tokens', () => {
    for (const tokens of [[], [''], ['a/b', '~', '界😀', '01', '10'], ['~1']])
      expect(splitPointer(joinPointer(tokens))).toEqual(tokens)
    expect(splitPointer('/~01')).toEqual(['~1'])
    expect(parentPointer('')).toBeNull()
    expect(parentPointer('/x')).toBe('')
    expect(parentPointer('/a~1b/')).toBe('/a~1b')
    for (const pointer of ['x', '/~', '/~2', '/' + '界'.repeat(2000)])
      expect(() => splitPointer(pointer)).toThrowError('INVALID_INPUT')
    expect(() => joinPointer(['界'.repeat(2000)])).toThrowError('INVALID_INPUT')
    expect(() => joinPointer([1] as never)).toThrowError('INVALID_INPUT')
    expect(() => joinPointer(new Array<string>(1))).toThrowError('INVALID_INPUT')
  })
  it('orders case-sensitive names by code units even on case-insensitive filesystems', () => {
    const entries = ['a', 'A', '10', '2', '界'].map((name) => ({
      kind: 'directory' as const,
      name,
      path: name as DirectoryPath,
    }))
    expect(entries.sort(compareDirectoryEntries).map((entry) => entry.name)).toEqual([
      '10',
      '2',
      'A',
      'a',
      '界',
    ])
  })
  it('validates exact requests and response identities, ordering and continuation', async () => {
    await mkdir(join(root, 'folder'))
    await writeFile(join(root, 'a.json'), 'bad JSON is not parsed')
    const input = command()
    const result = await list()
    expect(validRawResult({ ok: true, value: result }, input)).toBe(true)
    for (const invalid of [
      { ...input, limit: 0 },
      { ...input, limit: 201 },
      { ...input, cursor: 'offset:1' },
      { ...input, root },
      { ...input, directory: '..' },
    ])
      expect(validCommand(invalid)).toBe(false)
    for (const invalid of [
      { ...result, directory: 'wrong' },
      { ...result, workspaceId: randomUUID() },
      { ...result, items: [...result.items].reverse() },
      { ...result, truncated: true },
      { ...result, items: [{ kind: 'directory', name: 'folder', path: '/folder' }] },
    ])
      expect(validRawResult({ ok: true, value: invalid }, input)).toBe(false)
  })
})
describe('production directory discovery', () => {
  it('reports a vanished child during enumeration as stale rather than missing directory', async () => {
    await writeFile(join(root, 'gone.json'), '0')
    const original = filesystem.opendir
    vi.spyOn(filesystem, 'opendir').mockImplementationOnce(async (...args) => {
      const handle = await original(...args)
      const read = handle.read.bind(handle)
      vi.spyOn(handle, 'read').mockImplementationOnce(async () => {
        const entry = await read()
        await filesystem.unlink(join(root, entry!.name))
        return entry
      })
      return handle
    })
    await expect(list()).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    expect((await list()).items).toEqual([])
  })
  it('closes an actively enumerated directory on cancellation and can refresh afterwards', async () => {
    await mkdir(join(root, 'a'))
    const controller = new AbortController()
    const original = filesystem.opendir
    let closed = false
    vi.spyOn(filesystem, 'opendir').mockImplementationOnce(async (...args) => {
      const handle = await original(...args)
      const read = handle.read.bind(handle)
      const close = handle.close.bind(handle)
      vi.spyOn(handle, 'read').mockImplementationOnce(async () => {
        const entry = await read()
        controller.abort()
        return entry
      })
      vi.spyOn(handle, 'close').mockImplementation(async () => {
        await close()
        closed = true
      })
      return handle
    })
    await expect(service.execute(command(), controller.signal)).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    expect(closed).toBe(true)
    expect((await list()).items.length).toBe(1)
  })
  it('lists one level, filters exact JSON regular files and sorts deterministically', async () => {
    for (const name of ['z', 'A', '界', 'empty']) await mkdir(join(root, name))
    for (const name of ['b.json', 'A-source.json', '界.json', 'skip.JSON', 'skip.txt'])
      await writeFile(join(root, name), 'not parsed')
    await writeFile(join(root, 'A', 'nested.json'), '{}')
    const result = await list()
    expect(result.items.map((entry) => entry.name)).toEqual([
      'A',
      'empty',
      'z',
      '界',
      'A-source.json',
      'b.json',
      '界.json',
    ])
    expect((await list('empty')).items).toEqual([])
    expect((await list('A')).items.map((entry) => entry.name)).toEqual(['nested.json'])
    const source = {
      workspaceId,
      relativePath: 'b.json' as import('../src/shared/raw').RelativePath,
    }
    expect(await service.execute({ kind: 'release', source }, signal())).toEqual({
      released: false,
    })
    await expect(list('b.json')).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })
  it('paginates a stable snapshot without missing, duplicate or empty continuation pages', async () => {
    for (const name of ['c', 'a', 'b']) await mkdir(join(root, name))
    const names: string[] = []
    let cursor: string | null = null
    do {
      const page = await list('', 1, cursor)
      expect(page.items.length).toBe(1)
      names.push(...page.items.map((entry) => entry.name))
      cursor = page.nextCursor
      expect(page.truncated).toBe(cursor !== null)
    } while (cursor)
    expect(names).toEqual(['a', 'b', 'c'])
    const first = await list('', 1)
    expect((await list('', 1, first.nextCursor)).items).toEqual(
      (await list('', 1, first.nextCursor)).items,
    )
  })
  it('invalidates changed/deleted directories and refuses cross-directory or old-workspace cursors', async () => {
    await mkdir(join(root, 'a'))
    await mkdir(join(root, 'b'))
    const first = await list('', 1)
    await expect(list('a', 1, first.nextCursor)).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    const before = await stat(root)
    await mkdir(join(root, 'c'))
    // NTFS 短间隔目录 mutation 不保证产生不同 stat 时间戳；建立确定的 fixture revision。
    await utimes(root, before.atime, new Date(before.mtimeMs + 1000))
    await expect(list('', 1, first.nextCursor)).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    await writeFile(join(root, 'a', '1.json'), '1')
    await writeFile(join(root, 'a', '2.json'), '2')
    const nested = await list('a', 1)
    await rm(join(root, 'a'), { recursive: true })
    await expect(list('a', 1, nested.nextCursor)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const oldId = workspaceId
    const reopened = (await service.execute({ kind: 'open', root }, signal())) as {
      workspaceId: WorkspaceId
    }
    workspaceId = reopened.workspaceId
    await expect(
      service.execute({ ...command(), workspaceId: oldId }, signal()),
    ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_OPEN' })
    await expect(list('', 1, first.nextCursor)).rejects.toMatchObject({ code: 'STALE_CURSOR' })
  })
  it('filters links/junctions and revalidates a listed source at acquisition', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'refatlas-directory-outside-'))
    try {
      await writeFile(join(outside, 'secret.json'), '1')
      await symlink(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
      expect((await list()).items).toEqual([])
      await expect(list('link')).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
      await mkdir(join(root, 'safe'))
      await writeFile(join(root, 'safe', 'data.json'), '1')
      expect((await list('safe')).items.length).toBe(1)
      await rm(join(root, 'safe'), { recursive: true })
      await symlink(outside, join(root, 'safe'), process.platform === 'win32' ? 'junction' : 'dir')
      await expect(
        service.execute(
          {
            kind: 'info',
            source: {
              workspaceId,
              relativePath: 'safe/data.json' as import('../src/shared/raw').RelativePath,
            },
          },
          signal(),
        ),
      ).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
  it('shrinks pages using full envelopes with long Unicode names and paths', async () => {
    const directory = Array.from({ length: 4 }, (_, i) => 'd' + i + 'x'.repeat(140)).join('/')
    const path = join(root, ...directory.split('/'))
    await mkdir(path, { recursive: true })
    for (let i = 0; i < 100; i++) await writeFile(join(path, '界'.repeat(70) + i + '.json'), '0')
    let cursor: string | null = null
    let count = 0
    do {
      const page = await list(directory, 200, cursor)
      expect(page.items.length).toBeGreaterThan(0)
      expect(page.items.length).toBeLessThan(100)
      expect(
        byteSize({ type: 'response', id: randomUUID(), result: { ok: true, value: page } }),
      ).toBeLessThanOrEqual(RAW_LIMITS.responseBytes)
      count += page.items.length
      cursor = page.nextCursor
    } while (cursor)
    expect(count).toBe(100)
  })
  it('enforces scan/metadata/work/page budgets and snapshot TTL/count/bytes eviction', async () => {
    for (const name of ['a', 'b', 'c']) await mkdir(join(root, name))
    const workspace = { id: workspaceId, root: await realpath(root), generation: 1 }
    const limits = { ...DIRECTORY_LIMITS, snapshots: 1 }
    const directory = new RawDirectory(limits)
    const first = await directory.list(command('', 1), workspace, () => {})
    await directory.list(command('a'), workspace, () => {})
    await expect(
      directory.list(command('', 1, first.nextCursor), workspace, () => {}),
    ).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const ttl = new RawDirectory()
    const page = await ttl.list(command('', 1), workspace, () => {})
    now = DIRECTORY_LIMITS.ttlMs + 1
    await expect(
      ttl.list(command('', 1, page.nextCursor), workspace, () => {}),
    ).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    vi.restoreAllMocks()
    for (const [changes, limit] of [
      [{ scan: 2 }, 'DIRECTORY_SCAN'],
      [{ snapshotBytes: 256 }, 'DIRECTORY_SNAPSHOT_BYTES'],
      [{ workMs: -1 }, 'DIRECTORY_WORK_MS'],
    ] as const) {
      await expect(
        new RawDirectory({ ...DIRECTORY_LIMITS, ...changes }).list(command(), workspace, () => {}),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT', details: { limit } })
    }
    const bytes = new RawDirectory({ ...DIRECTORY_LIMITS, cacheBytes: 650 })
    const old = await bytes.list(command('', 1), workspace, () => {})
    await bytes.list(command('a'), workspace, () => {})
    await expect(
      bytes.list(command('', 1, old.nextCursor), workspace, () => {}),
    ).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    await expect(
      new RawDirectory(DIRECTORY_LIMITS, 200).list(command(), workspace, () => {}),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT', details: { limit: 'RESPONSE_BYTES' } })
  })
})
