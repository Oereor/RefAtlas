import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, open, readFile, rm, symlink, unlink, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { RawDataService } from '../src/utility/raw-service'
import { scanJson, WorkBudget } from '../src/utility/raw-parser'
import {
  RAW_LIMITS,
  byteSize,
  validCommand,
  validRawResult,
  commandFromInput,
} from '../src/shared/raw'
import type {
  JsonPointer,
  NodeAddress,
  NodeResult,
  RawCommand,
  RelativePath,
  SourceAddress,
  SourceInfo,
  WorkspaceId,
  ChildrenResult,
  SegmentResult,
} from '../src/shared/raw'

let root: string, service: RawDataService, workspaceId: WorkspaceId
const signal = () => new AbortController().signal
const source = (file = 'sample.json'): SourceAddress => ({
  workspaceId,
  relativePath: file as RelativePath,
})
const address = (pointer = '', file = 'sample.json'): NodeAddress => ({
  source: source(file),
  pointer: pointer as JsonPointer,
})
const info = async (file = 'sample.json') =>
  (await service.execute({ kind: 'info', source: source(file) }, signal())) as SourceInfo
const fixture =
  '\uFEFF{"n":16752756560315677817,"z":-0,"d":1.00,"e":1e+3,"s":"16752756560315677817","a~b/c":"中文🙂\\uD800", "obj":{"10":true,"2":null,"__proto__":"raw"},"list":[1,"2",false],"empty":[]}'
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'refatlas-raw-test-'))
  await writeFile(join(root, 'sample.json'), fixture)
  service = new RawDataService()
  const opened = (await service.execute({ kind: 'open', root }, signal())) as {
    workspaceId: WorkspaceId
  }
  workspaceId = opened.workspaceId
})
afterEach(async () => {
  service.dispose()
  await rm(root, { recursive: true, force: true })
})
const read = async (pointer = '', file = 'sample.json'): Promise<NodeResult> => {
  const revision = (await info(file)).revision
  return (await service.execute(
    { kind: 'read', address: address(pointer, file), expectedRevision: revision },
    signal(),
  )) as NodeResult
}
describe('production raw access', () => {
  it('preserves raw types, lexemes, ordering, escaped pointers and cached ranges', async () => {
    const expected = [
      ['/n', { kind: 'number', lexeme: '16752756560315677817' }],
      ['/z', { kind: 'number', lexeme: '-0' }],
      ['/d', { kind: 'number', lexeme: '1.00' }],
      ['/e', { kind: 'number', lexeme: '1e+3' }],
      ['/s', { kind: 'string', value: '16752756560315677817' }],
      ['/a~0b~1c', { kind: 'string', value: '中文🙂\uD800' }],
    ] as const
    for (const [pointer, value] of expected) {
      const cold = await read(pointer)
      const warm = await read(pointer)
      expect(cold).toEqual(warm)
      expect(cold).toMatchObject({ mode: 'complete', value })
      const bytes = await readFile(join(root, 'sample.json'))
      const range = cold.node.range!
      expect(bytes.subarray(range.startByte, range.endByteExclusive).toString()).not.toMatch(/\s$/)
    }
    expect(await read('/obj')).toMatchObject({
      mode: 'complete',
      value: {
        kind: 'object',
        entries: [
          { key: '10', value: { kind: 'boolean', value: true } },
          { key: '2', value: { kind: 'null' } },
          { key: '__proto__', value: { kind: 'string', value: 'raw' } },
        ],
      },
    })
    expect(await read('/list/0')).toMatchObject({ value: { kind: 'number', lexeme: '1' } })
    expect(await read('/empty')).toMatchObject({ value: { kind: 'array', items: [] } })
    await expect(read('/list/01')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it.each([1, 2, 3, 7, 4096])(
    'restores BOM/UTF-8/escape ranges with %i byte input blocks',
    async (chunkBytes) => {
      const handle = await open(join(root, 'sample.json'), 'r')
      try {
        const size = (await handle.stat()).size
        const limits = { ...RAW_LIMITS, chunkBytes }
        const scan = await scanJson(handle, size, new WorkBudget(signal(), limits), {
          pointer: '/a~0b~1c' as JsonPointer,
          materialize: true,
        })
        expect(scan.value).toEqual({ kind: 'string', value: '中文🙂\uD800' })
        const range = scan.node!.range
        const recovered = await scanJson(
          handle,
          size,
          new WorkBudget(signal(), limits),
          { pointer: '/a~0b~1c' as JsonPointer, materialize: true },
          range,
          '/a~0b~1c' as JsonPointer,
        )
        expect(recovered.value).toEqual(scan.value)
      } finally {
        await handle.close()
      }
    },
  )
  it('returns bounded summaries, ordinal pages and scalar segments', async () => {
    const text = '🙂中文'.repeat(10000)
    await writeFile(
      join(root, 'large.json'),
      JSON.stringify({ wide: Array.from({ length: 3000 }, (_, i) => i), text }),
    )
    const revision = (await info('large.json')).revision
    const container = await read('/wide', 'large.json')
    expect(container.mode).toBe('summary')
    expect(byteSize(container)).toBeLessThan(RAW_LIMITS.responseBytes)
    const command = {
      kind: 'children',
      address: address('/wide', 'large.json'),
      expectedRevision: revision,
      limit: 100,
      cursor: null,
    } satisfies RawCommand
    const first = (await service.execute(command, signal())) as ChildrenResult
    const next = (await service.execute(
      { ...command, cursor: first.nextCursor },
      signal(),
    )) as ChildrenResult
    expect(first.items[0].ordinal).toBe(0)
    expect(next.items[0].ordinal).toBe(100)
    expect(first.truncated).toBe(true)
    expect(validRawResult({ ok: true, value: first }, command)).toBe(true)
    const scalar = await read('/text', 'large.json')
    expect(scalar.mode).toBe('summary')
    let cursor: string | null = null,
      decoded = ''
    do {
      const result = (await service.execute(
        {
          kind: 'segment',
          address: address('/text', 'large.json'),
          expectedRevision: revision,
          limit: 4096,
          cursor,
        },
        signal(),
      )) as SegmentResult
      decoded += result.text
      cursor = result.nextCursor
      expect([...result.text].length).toBeLessThanOrEqual(4096)
      expect(result.text).not.toMatch(/[\uD800-\uDBFF]$/)
    } while (cursor)
    expect(decoded).toBe(text)
  })
  it.each([
    ['duplicate', '{"x":1,"x":2}', 'AMBIGUOUS_OBJECT_KEY'],
    ['malformed', '{"x":1,}', 'INVALID_JSON'],
    ['tail', '{"x":1} rubbish', 'INVALID_JSON'],
    ['number', '[01]', 'INVALID_JSON'],
    ['deep', '['.repeat(130) + '0' + ']'.repeat(130), 'RESOURCE_LIMIT'],
    ['huge', JSON.stringify('x'.repeat(512 * 1024)), 'RESOURCE_LIMIT'],
    ['utf8', Buffer.from([34, 0xc3, 0x28, 34]), 'INVALID_JSON'],
  ])('rejects %s without returning corrupt truth', async (name, contents, code) => {
    await writeFile(join(root, name + '.json'), contents)
    await expect(read('', name + '.json')).rejects.toMatchObject({ code })
    expect((await info(name + '.json')).validated).toBe(false)
  })
  it('invalidates ranges/cursors on modification and deletion and explicitly reloads', async () => {
    const old = await info()
    await read('/n')
    const page = (await service.execute(
      {
        kind: 'children',
        address: address(),
        expectedRevision: old.revision,
        limit: 1,
        cursor: null,
      },
      signal(),
    )) as ChildrenResult
    await writeFile(join(root, 'sample.json'), '{"n":3}')
    await expect(
      service.execute(
        { kind: 'read', address: address('/n'), expectedRevision: old.revision },
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    expect((await info()).state).toBe('stale')
    const fresh = (await service.execute(
      { kind: 'reload', source: source() },
      signal(),
    )) as SourceInfo
    expect(fresh.revision).not.toBe(old.revision)
    await expect(
      service.execute(
        {
          kind: 'children',
          address: address(),
          expectedRevision: fresh.revision,
          limit: 1,
          cursor: page.nextCursor,
        },
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    expect(await read('/n')).toMatchObject({ value: { kind: 'number', lexeme: '3' } })
    await unlink(join(root, 'sample.json'))
    await expect(
      service.execute(
        { kind: 'read', address: address('/n'), expectedRevision: fresh.revision },
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    await expect(info('missing.json')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('stops active/queued scans, rejects mixed revisions and forgets workspace on restart', async () => {
    await writeFile(join(root, 'busy.json'), '[' + '0,'.repeat(200000) + '0]')
    const revision = (await info('busy.json')).revision
    const command = {
      kind: 'read',
      address: address('', 'busy.json'),
      expectedRevision: revision,
    } satisfies RawCommand
    const active = new AbortController(),
      queued = new AbortController()
    const first = service.execute(command, active.signal).catch((error) => error.code)
    const second = service.execute(command, queued.signal).catch((error) => error.code)
    queued.abort()
    setTimeout(() => active.abort(), 10)
    expect(await first).toBe('CANCELLED')
    expect(await second).toBe('CANCELLED')
    const changing = service.execute(command, signal()).catch((error) => error.code)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await writeFile(join(root, 'busy.json'), '[2]')
    expect(await changing).toBe('SOURCE_CHANGED')
    const oldWorkspace = workspaceId
    service.dispose()
    service = new RawDataService()
    await expect(
      service.execute(
        {
          kind: 'info',
          source: { workspaceId: oldWorkspace, relativePath: 'sample.json' as RelativePath },
        },
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_OPEN' })
  })
  it('rejects path escapes and symlink/junction reads', async () => {
    for (const path of [
      '../sample.json',
      '/sample.json',
      'C:/sample.json',
      'a\\sample.json',
      'a//sample.json',
      './sample.json',
      'sample.txt',
    ])
      expect(validCommand({ kind: 'info', source: { workspaceId, relativePath: path } })).toBe(
        false,
      )
    const outside = await mkdtemp(join(tmpdir(), 'refatlas-raw-outside-'))
    try {
      await writeFile(join(outside, 'secret.json'), '1')
      await symlink(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
      await expect(info('link/secret.json')).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
  it('enforces work/token/key budgets rather than only response size', async () => {
    const handle = await open(join(root, 'sample.json'), 'r')
    try {
      for (const [limits, limit] of [
        [{ readBytes: 10 }, 'READ_BYTES'],
        [{ tokens: 3 }, 'TOKENS'],
        [{ keys: 1 }, 'DUPLICATE_KEYS'],
        [{ workMs: -1 }, 'WORK_MS'],
      ] as const) {
        await expect(
          scanJson(
            handle,
            (await handle.stat()).size,
            new WorkBudget(signal(), { ...RAW_LIMITS, ...limits }),
            { pointer: '' as JsonPointer, materialize: false },
          ),
        ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT', details: { limit } })
      }
    } finally {
      await handle.close()
    }
  })
  it('stops huge scalar allocation at the input bound and cancels on workspace close', async () => {
    const path = join(root, 'huge.json')
    await writeFile(path, JSON.stringify('x'.repeat(1024 * 1024)))
    const handle = await open(path, 'r'),
      budget = new WorkBudget(signal())
    try {
      await expect(
        scanJson(handle, (await handle.stat()).size, budget, {
          pointer: '' as JsonPointer,
          materialize: false,
        }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT', details: { limit: 'TOKEN_BYTES' } })
      expect(budget.bytes).toBeLessThanOrEqual(RAW_LIMITS.tokenBytes + RAW_LIMITS.chunkBytes + 3)
    } finally {
      await handle.close()
    }
    await writeFile(join(root, 'busy.json'), '[' + '0,'.repeat(200000) + '0]')
    const metadata = await info('busy.json')
    const pending = service
      .execute(
        { kind: 'read', address: address('', 'busy.json'), expectedRevision: metadata.revision },
        signal(),
      )
      .catch((error) => error.code)
    await new Promise((resolve) => setTimeout(resolve, 5))
    await service.execute({ kind: 'close', workspaceId }, signal())
    expect(await pending).toBe('CANCELLED')
  })
  it('detects source replacement and keeps identity independent of property order', async () => {
    const original = await info()
    await read('/n')
    const reordered = { relativePath: 'sample.json' as RelativePath, workspaceId }
    expect(
      ((await service.execute({ kind: 'info', source: reordered }, signal())) as SourceInfo)
        .revision,
    ).toBe(original.revision)
    const command = {
      kind: 'read',
      address: { pointer: '/n' as JsonPointer, source: reordered },
      expectedRevision: original.revision,
    } satisfies RawCommand
    const result = await service.execute(command, signal())
    expect(validRawResult({ ok: true, value: result }, command)).toBe(true)
    await writeFile(join(root, 'replacement.json'), '{"n":9}')
    await rename(join(root, 'replacement.json'), join(root, 'sample.json'))
    await expect(service.execute(command, signal())).rejects.toMatchObject({
      code: 'SOURCE_CHANGED',
    })
  })
  it('validates the query envelope and refuses complete/summary confusion', async () => {
    expect(commandFromInput('info', { requestId: randomUUID(), kind: 'open', root })).toBeNull()
    expect(
      commandFromInput('info', { requestId: randomUUID(), kind: 'info', source: source() }),
    ).toBeNull()
    const revision = (await info()).revision
    const command = {
      kind: 'read',
      address: address('/n'),
      expectedRevision: revision,
    } satisfies RawCommand
    const value = await service.execute(command, signal())
    expect(validRawResult({ ok: true, value }, command)).toBe(true)
    expect(
      validRawResult(
        { ok: true, value: { mode: 'complete', node: (value as NodeResult).node } },
        command,
      ),
    ).toBe(false)
    expect(
      validRawResult(
        { ok: false, error: { code: 'INVALID_JSON', message: 'locale text' } },
        command,
      ),
    ).toBe(false)
    expect(validCommand({ ...command, extra: true })).toBe(false)
    expect(validCommand({ ...command, address: address('/a~2') })).toBe(false)
    expect(
      validCommand({ ...command, expectedRevision: randomUUID(), address: address('/a~0b~1c') }),
    ).toBe(true)
  })
})
