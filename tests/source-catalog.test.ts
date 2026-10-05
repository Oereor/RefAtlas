import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import * as fs from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { RawSourceCatalog } from '../src/utility/raw-source-catalog'
import { RawDataService } from '../src/utility/raw-service'
import { resolveRawDirectorySync } from '../src/utility/raw-filesystem'
import { scanCatalog } from '../src/utility/raw-catalog-scan'
import { workerCatalogRunner } from '../src/utility/raw-catalog-worker-runner'
import {
  byteSize,
  LOCATOR_LIMITS,
  RAW_LIMITS,
  validCommand,
  validRawResult,
} from '../src/shared/raw'
import type { LocatorResult, RawCommand, RelativePath, WorkspaceId } from '../src/shared/raw'

vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
}))
let root: string, catalog: RawSourceCatalog
const id = randomUUID() as WorkspaceId
const workspace = () => ({ id, root, generation: 1 })
const input = (
  query: string,
  limit = 50,
  catalogGeneration: string | null = null,
): Extract<RawCommand, { kind: 'locate' }> => ({
  kind: 'locate',
  workspaceId: id,
  query,
  limit,
  catalogGeneration,
})
const query = (text: string, limit = 50) => catalog.locate(input(text, limit), () => {})
async function ready() {
  const deadline = performance.now() + 3000
  while ((await query('json')).status === 'building') {
    if (performance.now() > deadline) throw Error('BUILD_DEADLINE')
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'refatlas-catalog-')))
  catalog = new RawSourceCatalog()
})
afterEach(async () => {
  await catalog.clear()
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function files(paths: string[]) {
  for (const path of paths) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), 'invalid JSON deliberately remains unread')
  }
}

describe('workspace path catalog', () => {
  it('enumerates nested exact JSON regular files, skips metadata and junctions, preserves raw names, and never reads content', async () => {
    await files([
      'Excel/AvatarSkill.json',
      'Other/AvatarSkill.json',
      'nested/说明🙂.json',
      'UPPER.JSON',
      'plain.txt',
      '.git/ignored.json',
      'nested/.git/deep/ignored.json',
      '.hidden/visible.json',
    ])
    await mkdir(join(root, 'looks.json'))
    const outside = await mkdtemp(join(tmpdir(), 'refatlas-catalog-outside-'))
    try {
      await writeFile(join(outside, 'escape.json'), '0')
      await symlink(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
      await symlink(
        join(root, 'Excel'),
        join(root, 'internal-link'),
        process.platform === 'win32' ? 'junction' : 'dir',
      )
      for (const path of ['link', 'internal-link', '..'])
        expect(() => resolveRawDirectorySync(root, path, () => {})).toThrowError('ACCESS_DENIED')
      const read = vi.spyOn(fs, 'openSync').mockImplementation(() => {
        throw Error('CONTENT_ACCESS_FORBIDDEN')
      })
      catalog.rebuild(workspace())
      await ready()
      const found = await query('json')
      expect(found.items.map((item) => item.source.relativePath).sort()).toEqual([
        '.hidden/visible.json',
        'Excel/AvatarSkill.json',
        'Other/AvatarSkill.json',
        'nested/说明🙂.json',
      ])
      expect(read).not.toHaveBeenCalled()
      expect(found.items.every((item) => item.source.workspaceId === id)).toBe(true)
    } finally {
      await catalog.clear()
      await rm(outside, { recursive: true, force: true })
    }
  })
  it('ranks exact, prefix, basename contains, then path contains with raw deterministic tie-break', async () => {
    await files([
      'b/AvatarSkill.json',
      'a/AvatarSkill.json',
      'a/avatarSkill.json.extra.json',
      'a/xAvatarSkill.json',
      'AvatarSkill.json/pathOnly.json',
    ])
    catalog.rebuild(workspace())
    await ready()
    expect((await query('AVATARSKILL.JSON')).items.map((item) => item.source.relativePath)).toEqual(
      [
        'a/AvatarSkill.json',
        'b/AvatarSkill.json',
        'a/avatarSkill.json.extra.json',
        'a/xAvatarSkill.json',
        'AvatarSkill.json/pathOnly.json',
      ],
    )
    expect((await query('pathOnly')).items[0].name).toBe('pathOnly.json')
    expect((await query('a/Avatar')).items.map((item) => item.source.relativePath)).toContain(
      'a/AvatarSkill.json',
    )
    expect((await query('')).items).toEqual([])
    expect((await query('missing')).items).toEqual([])
    expect((await query('Avatar*')).items).toEqual([])
  })
  it('bounds broad matches and complete envelopes, shrinks long-path responses and fails when no item fits', async () => {
    await files(
      Array.from(
        { length: 70 },
        (_, index) => 'folder/' + index.toString().padStart(3, '0') + '.json',
      ),
    )
    catalog.rebuild(workspace())
    await ready()
    const found = await query('json')
    expect(found.items).toHaveLength(50)
    expect(found.truncated).toBe(true)
    expect(
      byteSize({ type: 'response', id: randomUUID(), result: { ok: true, value: found } }),
    ).toBeLessThan(RAW_LIMITS.responseBytes)
    await catalog.clear()
    catalog = new RawSourceCatalog(LOCATOR_LIMITS, 500)
    catalog.rebuild(workspace())
    await ready()
    const smaller = await query('json')
    expect(smaller.items.length).toBeLessThan(50)
    expect(smaller.truncated).toBe(true)
    await catalog.clear()
    catalog = new RawSourceCatalog(LOCATOR_LIMITS, 100)
    catalog.rebuild(workspace())
    await expect(ready()).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT',
      details: { limit: 'RESPONSE_BYTES' },
    })
  })
  it.each([
    ['sources', 1, 'CATALOG_SOURCES'],
    ['directories', 1, 'CATALOG_DIRECTORIES'],
    ['entries', 1, 'CATALOG_ENTRIES'],
    ['bytes', 1, 'CATALOG_BYTES'],
    ['buildMs', -1, 'CATALOG_BUILD_MS'],
  ] as const)(
    'reports %s limits explicitly without publishing partial results',
    async (key, value, limit) => {
      await files(['nested/a.json', 'nested/b.json'])
      catalog = new RawSourceCatalog({ ...LOCATOR_LIMITS, [key]: value })
      catalog.rebuild(workspace())
      await expect(ready()).rejects.toMatchObject({ code: 'RESOURCE_LIMIT', details: { limit } })
      expect(catalog.metrics?.sources).toBe(0)
    },
  )
  it('rejects observable mutation during enumeration and recovers only on explicit rebuild', async () => {
    await files(['a.json'])
    const open = fs.opendirSync
    vi.spyOn(fs, 'opendirSync').mockImplementationOnce((...args) => {
      const handle = open(...args),
        read = handle.readSync.bind(handle)
      vi.spyOn(handle, 'readSync').mockImplementationOnce(() => {
        const entry = read()
        fs.utimesSync(root, new Date(), new Date(Date.now() + 10000))
        return entry
      })
      return handle
    })
    catalog.rebuild(workspace())
    await expect(ready()).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    catalog.rebuild(workspace())
    await ready()
    expect((await query('a.json')).items).toHaveLength(1)
  })
  it('refresh rediscovers added/deleted paths and invalidates old generations and in-flight queries', async () => {
    await files(['old.json', 'keep.json'])
    catalog = new RawSourceCatalog({ ...LOCATOR_LIMITS, queryYieldEvery: 1 })
    const old = catalog.rebuild(workspace())
    await ready()
    await unlink(join(root, 'old.json'))
    await files(['new.json'])
    const late = catalog.locate(input('json', 50, old.catalogGeneration), () => {})
    catalog.rebuild(workspace())
    await expect(late).rejects.toMatchObject({ code: 'CANCELLED' })
    await expect(
      catalog.locate(input('json', 50, old.catalogGeneration), () => {}),
    ).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    await ready()
    expect((await query('json')).items.map((item) => item.name)).toEqual(['keep.json', 'new.json'])
    const controller = new AbortController()
    const cancelled = catalog.locate(input('json'), () => {
      if (controller.signal.aborted) throw Object.assign(Error(), { code: 'CANCELLED' })
    })
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(catalog.metrics?.status).toBe('ready')
  })
  it('rejects changes found by final directory verification and metadata access failures', async () => {
    await files(['nested/a.json'])
    const stat = fs.statSync
    let rootChecks = 0
    vi.spyOn(fs, 'statSync').mockImplementation((...args) => {
      if (String(args[0]) === root && ++rootChecks === 3)
        fs.utimesSync(root, new Date(), new Date(Date.now() + 10000))
      return stat(...args)
    })
    catalog.rebuild(workspace())
    await expect(ready()).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    expect(catalog.metrics?.sources).toBe(0)
    vi.restoreAllMocks()
    vi.spyOn(fs, 'opendirSync').mockImplementationOnce(() => {
      throw Object.assign(Error(), { code: 'EACCES' })
    })
    catalog.rebuild(workspace())
    await expect(ready()).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect(catalog.metrics?.sources).toBe(0)
  })
  it('waits for cancelled traversal cleanup before refresh starts another handle', async () => {
    await files(Array.from({ length: 70 }, (_, index) => index + '.json'))
    let resume!: () => void,
      entered!: () => void,
      pause = true,
      handles = 0,
      maximum = 0
    const paused = new Promise<void>((resolve) => (resume = resolve))
    const started = new Promise<void>((resolve) => (entered = resolve))
    const open = fs.opendirSync
    vi.spyOn(fs, 'opendirSync').mockImplementation((...args) => {
      const handle = open(...args),
        close = handle.closeSync.bind(handle)
      maximum = Math.max(maximum, ++handles)
      vi.spyOn(handle, 'closeSync').mockImplementation(() => {
        close()
        handles--
      })
      return handle
    })
    catalog = new RawSourceCatalog(undefined, undefined, (root, limits, signal, emit) =>
      scanCatalog(
        root,
        limits,
        () => {
          if (signal.aborted) throw Object.assign(Error(), { code: 'CANCELLED' })
        },
        async (entries, metrics) => {
          if (pause) {
            entered()
            await paused
          }
          emit(entries, metrics)
        },
      ),
    )
    catalog.rebuild(workspace())
    await started
    let cleared = false
    const clearing = catalog.clear().then(() => {
      cleared = true
    })
    catalog.rebuild(workspace())
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(cleared).toBe(false)
    expect(handles).toBe(1)
    pause = false
    resume()
    await clearing
    await ready()
    expect(maximum).toBe(1)
    expect(handles).toBe(0)
    expect((await query('json')).items).toHaveLength(50)
    await catalog.clear()
    expect(catalog.metrics).toBeNull()
    await expect(query('json')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_OPEN' })
  })
  it('runs the production worker with bounded packets and waits for worker exit on reset', async () => {
    await files(Array.from({ length: 200 }, (_, index) => 'nested/' + index + '.json'))
    catalog = new RawSourceCatalog(
      undefined,
      undefined,
      workerCatalogRunner(new URL('../src/utility/raw-catalog-worker.ts', import.meta.url), [
        '--experimental-transform-types',
        '--import',
        new URL('./helpers/source-catalog-loader.mjs', import.meta.url).href,
      ]),
    )
    catalog.rebuild(workspace())
    await ready()
    expect(catalog.metrics?.sources).toBe(200)
    const generation = catalog.rebuild(workspace()).catalogGeneration
    await catalog.clear()
    catalog.rebuild(workspace())
    await expect(catalog.locate(input('json', 50, generation), () => {})).rejects.toMatchObject({
      code: 'STALE_CURSOR',
    })
    await ready()
    expect((await query('json')).items).toHaveLength(50)
  })
  it('uses the service workspace lifetime and does not acquire discovered sources', async () => {
    await files(['a.json'])
    const service = new RawDataService(undefined, catalog),
      signal = new AbortController().signal
    try {
      const opened = (await service.execute({ kind: 'open', root }, signal)) as {
        workspaceId: WorkspaceId
      }
      let result: LocatorResult
      do {
        await new Promise<void>((resolve) => setImmediate(resolve))
        result = (await service.execute(
          { ...input('json'), workspaceId: opened.workspaceId },
          signal,
        )) as LocatorResult
      } while (result.status === 'building')
      expect(
        await service.execute({ kind: 'release', source: result.items[0].source }, signal),
      ).toEqual({ released: false })
      await service.execute({ kind: 'close', workspaceId: opened.workspaceId }, signal)
      expect(catalog.metrics).toBeNull()
      await expect(
        service.execute({ ...input('json'), workspaceId: opened.workspaceId }, signal),
      ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_OPEN' })
    } finally {
      service.dispose()
    }
  })
  it('validates identities, literal match, exact wire shape and result ordering', async () => {
    await files(['a.json', 'b.json'])
    catalog.rebuild(workspace())
    await ready()
    const command = input('json'),
      value = await query('json')
    expect(validCommand(command)).toBe(true)
    expect(validRawResult({ ok: true, value }, command)).toBe(true)
    for (const change of [
      { limit: 51 },
      { limit: 0 },
      { root },
      { query: 1 },
      { catalogGeneration: 'bad' },
    ])
      expect(validCommand({ ...command, ...change })).toBe(false)
    for (const change of [
      { workspaceId: randomUUID() },
      { query: 'other' },
      { status: 'building' },
      { items: [...value.items].reverse() },
      {
        items: [
          {
            name: 'a.json',
            source: { workspaceId: id, relativePath: '../a.json' as RelativePath },
          },
        ],
      },
    ])
      expect(validRawResult({ ok: true, value: { ...value, ...change } }, command)).toBe(false)
  })
})
