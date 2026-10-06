import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RawDataService } from '../src/utility/raw-service'
import { createJsonWalk, WorkBudget } from '../src/utility/raw-parser'
import {
  byteSize,
  commandFromInput,
  FIND_LIMITS,
  RAW_LIMITS,
  validRawResult,
  rawFailure,
} from '../src/shared/raw'
import type {
  FindResult,
  FindInput,
  RawBridge,
  RawCommand,
  RawOutput,
  RawResult,
  SourceAddress,
  SourceInfo,
  WorkspaceId,
  JsonPointer,
  RelativePath,
} from '../src/shared/raw'
import { SourceSession } from '../src/renderer/src/state/source-session'
import { NodeBrowserController } from '../src/renderer/src/browser/node-browser-controller'
let root: string, service: RawDataService, source: SourceAddress, info: SourceInfo
const signal = () => new AbortController().signal
const fixture =
  '{"SkillID":140701,"a~b/c":{"中文":"技能🙂\\u6280能","num":16752756560315677817,"decimal":1.00,"zero":-0,"exponent":1e+3,"bool":true,"nil":null,"false":false},"same":"same same","list":["1407",131407],"box":{}}'
async function validate(text = fixture) {
  await writeFile(join(root, 'sample.json'), text)
  info = (await service.execute({ kind: 'reload', source }, signal())) as SourceInfo
  await service.execute(
    {
      kind: 'read',
      address: { source, pointer: '' as JsonPointer },
      expectedRevision: info.revision,
    },
    signal(),
  )
}
const command = (
  query: string,
  cursor: string | null = null,
  limit: number = FIND_LIMITS.page,
): Extract<RawCommand, { kind: 'find' }> => ({
  kind: 'find',
  source,
  expectedRevision: info.revision,
  query,
  cursor,
  limit,
})
const page = async (
  query: string,
  cursor: string | null = null,
  limit: number = FIND_LIMITS.page,
) => service.execute(command(query, cursor, limit), signal()) as Promise<FindResult>
async function all(query: string, limit: number = FIND_LIMITS.page) {
  let cursor: string | null = null
  const matches: FindResult['matches'] = []
  do {
    const result = await page(query, cursor, limit)
    expect(validRawResult({ ok: true, value: result }, command(query, cursor, limit))).toBe(true)
    expect(
      byteSize({ type: 'response', id: crypto.randomUUID(), result: { ok: true, value: result } }),
    ).toBeLessThanOrEqual(RAW_LIMITS.responseBytes)
    matches.push(...result.matches)
    cursor = result.nextCursor
  } while (cursor)
  return matches
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'refatlas-find-'))
  await writeFile(join(root, 'sample.json'), fixture)
  service = new RawDataService()
  const workspace = (await service.execute({ kind: 'open', root }, signal())) as {
    workspaceId: WorkspaceId
  }
  source = { workspaceId: workspace.workspaceId, relativePath: 'sample.json' as RelativePath }
  info = (await service.execute({ kind: 'info', source }, signal())) as SourceInfo
  await service.execute(
    {
      kind: 'read',
      address: { source, pointer: '' as JsonPointer },
      expectedRevision: info.revision,
    },
    signal(),
  )
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await service.execute({ kind: 'close', workspaceId: source.workspaceId }, signal())
  service.dispose()
  await rm(root, { recursive: true, force: true })
})
describe('structured source Find', () => {
  it.each([
    ['SkillID', [['/SkillID', 'key']]],
    [
      '1407',
      [
        ['/SkillID', 'value'],
        ['/list/0', 'value'],
        ['/list/1', 'value'],
      ],
    ],
    ['技能', [['/a~0b~1c/中文', 'value']]],
    ['🙂', [['/a~0b~1c/中文', 'value']]],
    ['16752756560315677817', [['/a~0b~1c/num', 'value']]],
    ['1.00', [['/a~0b~1c/decimal', 'value']]],
    ['-0', [['/a~0b~1c/zero', 'value']]],
    ['1e+3', [['/a~0b~1c/exponent', 'value']]],
    ['true', [['/a~0b~1c/bool', 'value']]],
    ['null', [['/a~0b~1c/nil', 'value']]],
    [
      'false',
      [
        ['/a~0b~1c/false', 'key'],
        ['/a~0b~1c/false', 'value'],
      ],
    ],
    [
      'same',
      [
        ['/same', 'key'],
        ['/same', 'value'],
      ],
    ],
    ['box', [['/box', 'key']]],
    ['skillid', []],
    ['{', []],
    [' absent ', []],
  ])('maps %s to exact navigable facts', async (query, expected) => {
    const matches = await all(query, 1)
    expect(matches.map((match) => [match.address.pointer, match.kind])).toEqual(expected)
    for (const match of matches)
      expect(
        await service.execute(
          { kind: 'read', address: match.address, expectedRevision: info.revision },
          signal(),
        ),
      ).toHaveProperty('node.address.pointer', match.address.pointer)
  })
  it('finds a root scalar once rather than every substring occurrence', async () => {
    await validate('"aaaa"')
    expect((await all('a')).map((match) => match.address.pointer)).toEqual([''])
  })
  it('has progressive bounded batches, consumes cursors and rejects changed context', async () => {
    await validate('[' + Array.from({ length: 3000 }, () => '1').join(',') + ']')
    const first = await page('1', null, 2)
    expect(first.matches).toHaveLength(2)
    expect(first.complete).toBe(false)
    expect(first.scannedBytes).toBeLessThan(first.sizeBytes)
    await expect(page('x', first.nextCursor, 2)).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    const second = await page('1', first.nextCursor, 2)
    expect(second.matches[0].ordinal).toBe(3)
    await expect(page('1', first.nextCursor, 2)).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    expect((await all('1')).length).toBe(3000)
  })
  it('shrinks long-address responses without dropping matches', async () => {
    await validate(JSON.stringify({ ['x'.repeat(2500)]: Array.from({ length: 40 }, () => 1) }))
    const first = await page('1')
    expect(first.matches.length).toBeLessThan(32)
    expect(first.matches.length).toBeGreaterThan(0)
    expect((await all('1')).length).toBe(40)
  })
  it('closes only the matching session and protects a new query from old close', async () => {
    const old = await page('same', null, 1),
      newer = await page('false', null, 1)
    expect(
      await service.execute(
        { kind: 'find-close', source, expectedRevision: info.revision, cursor: old.nextCursor! },
        signal(),
      ),
    ).toEqual({ released: false })
    expect((await page('false', newer.nextCursor, 1)).matches[0].kind).toBe('value')
  })
  it('invalidates continuation on file change, reload, release and workspace close', async () => {
    const first = await page('same', null, 1)
    await writeFile(join(root, 'sample.json'), fixture + ' ')
    await expect(page('same', first.nextCursor, 1)).rejects.toMatchObject({
      code: 'SOURCE_CHANGED',
    })
    await validate()
    await expect(page('same', first.nextCursor, 1)).rejects.toMatchObject({ code: 'STALE_CURSOR' })
    await service.execute({ kind: 'release', source }, signal())
    await expect(page('same')).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  })
  it.each(['{"x":1,"x":2}', '{', '[1,]'])(
    'does not publish facts from invalid or ambiguous sources: %s',
    async (text) => {
      await expect(validate(text)).rejects.toMatchObject({
        code: text.includes('"x":2') ? 'AMBIGUOUS_OBJECT_KEY' : 'INVALID_JSON',
      })
      await expect(page('x')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    },
  )
  it('cancels a late/no-match scan before completion', async () => {
    await validate('[' + '1,'.repeat(100000) + '1]')
    const controller = new AbortController()
    const pending = service.execute(command('absent'), controller.signal)
    setImmediate(() => controller.abort())
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    expect((await page('1')).matches.length).toBeGreaterThan(0)
  })
  it('counts active execution cumulatively while excluding suspended idle time', async () => {
    await validate('[' + '1,'.repeat(100000) + '1]')
    let clock = performance.now()
    const time = vi.spyOn(performance, 'now').mockImplementation(() => ++clock)
    try {
      let result = await page('absent')
      expect(result.complete).toBe(false)
      clock += 100000 // 调用之间的暂停不属于执行预算。
      result = await page('absent', result.nextCursor)
      expect(result.complete).toBe(false)
      await expect(
        (async () => {
          while (!result.complete) result = await page('absent', result.nextCursor)
        })(),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT', details: { limit: 'WORK_MS' } })
      await expect(page('absent', result.nextCursor)).rejects.toMatchObject({
        code: 'STALE_CURSOR',
      })
    } finally {
      time.mockRestore()
    }
  })
  it('validates exact requests, source context and result completeness', async () => {
    const input: FindInput = {
      requestId: crypto.randomUUID(),
      source,
      expectedRevision: info.revision,
      query: 'same',
      limit: 1,
      cursor: null,
    }
    expect(commandFromInput('find', input)).not.toBeNull()
    for (const extra of [
      { root: 'C:/' },
      { kind: 'read' },
      { query: '' },
      { query: 'x'.repeat(1024) },
      { limit: 33 },
    ])
      expect(commandFromInput('find', { ...input, ...extra })).toBeNull()
    const result = await page('same', null, 1)
    expect(
      validRawResult({ ok: true, value: { ...result, complete: true } }, command('same', null, 1)),
    ).toBe(false)
    expect(
      validRawResult(
        {
          ok: true,
          value: {
            ...result,
            matches: [
              {
                ...result.matches[0],
                address: {
                  ...result.matches[0].address,
                  source: { ...source, workspaceId: crypto.randomUUID() },
                },
              },
            ],
          },
        },
        command('same', null, 1),
      ),
    ).toBe(false)
  })
  it('keeps the same token/Unicode/range semantics across suspended blocks and cumulative budgets', async () => {
    const handle = await open(join(root, 'sample.json'), 'r')
    try {
      for (const chunkBytes of [1, 2, 3, 7, 4096]) {
        const facts: unknown[] = []
        const budget = new WorkBudget(signal(), { ...RAW_LIMITS, chunkBytes })
        const walk = createJsonWalk(
          Buffer.byteLength(fixture),
          budget,
          { pointer: '' as JsonPointer, materialize: false },
          null,
          undefined,
          (pointer, kind, text) => facts.push([pointer, kind, text]),
        )
        while (!(await walk.step(handle, budget))) {}
        expect(facts).toContainEqual(['/a~0b~1c/num', 'value', '16752756560315677817'])
        expect(facts).toContainEqual(['/a~0b~1c/中文', 'value', '技能🙂技能'])
        expect(walk.result!.node!.range.endByteExclusive).toBe(Buffer.byteLength(fixture))
      }
      const budget = new WorkBudget(signal(), { ...RAW_LIMITS, chunkBytes: 7, tokens: 4 })
      const walk = createJsonWalk(Buffer.byteLength(fixture), budget, {
        pointer: '' as JsonPointer,
        materialize: false,
      })
      await expect(
        (async () => {
          while (!(await walk.step(handle, budget))) {}
        })(),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT', details: { limit: 'TOKENS' } })
    } finally {
      await handle.close()
    }
  })
})
function bridgeFixture() {
  const tasks = new Map<string, AbortController>()
  const call = async (
    kind: RawCommand['kind'],
    input: Record<string, unknown>,
  ): Promise<RawResult<RawOutput>> => {
    const { requestId, ...rest } = input
    const controller = new AbortController()
    tasks.set(requestId as string, controller)
    try {
      return {
        ok: true,
        value: await service.execute({ ...rest, kind } as RawCommand, controller.signal),
      }
    } catch (error) {
      return rawFailure((error as { code: 'INTERNAL' }).code ?? 'INTERNAL')
    } finally {
      tasks.delete(requestId as string)
    }
  }
  const api = Object.fromEntries(
    Object.entries({
      getSourceInfo: 'info',
      reloadSource: 'reload',
      releaseSource: 'release',
      readNode: 'read',
      listNodeChildren: 'children',
      readScalarSegment: 'segment',
      findInSource: 'find',
      closeSourceFind: 'find-close',
    }).map(([method, kind]) => [
      method,
      (input: Record<string, unknown>) => call(kind as RawCommand['kind'], input),
    ]),
  ) as unknown as RawBridge
  api.cancelRequest = async (id) => {
    const task = tasks.get(id)
    task?.abort()
    return { ok: true, value: { accepted: !!task } }
  }
  const session = new SourceSession(api),
    browser = new NodeBrowserController(api, session)
  return { api, session, browser, find: browser.find }
}
async function settle(browser: NodeBrowserController) {
  await vi.waitFor(
    () =>
      expect(
        browser.snapshot.busy ||
          browser.find.snapshot.busy ||
          browser.find.snapshot.status === 'debouncing',
      ).toBe(false),
    { timeout: 5000, interval: 5 },
  )
}
describe('Find controller with production bridge semantics', () => {
  it('opens without changing view, navigates automatically, supports previous/next, closes and retains query', async () => {
    const { session, browser, find } = bridgeFixture()
    try {
      await session.activate(source)
      await settle(browser)
      const before = browser.snapshot.current
      find.open()
      expect(browser.snapshot.current).toBe(before)
      find.setQuery('same')
      await find.next()
      await settle(browser)
      expect(find.snapshot.position).toBe(0)
      expect(browser.snapshot.current!.address.pointer).toBe('/same')
      expect(browser.snapshot.preserveNavigationFocus).toBe(true)
      await find.next()
      expect(find.snapshot.matches[find.snapshot.position].kind).toBe('value')
      await find.previous()
      expect(find.snapshot.position).toBe(0)
      find.close()
      expect(find.snapshot.query).toBe('same')
      expect(browser.snapshot.current!.address.pointer).toBe('/same')
      find.open()
      await settle(browser)
      expect(find.snapshot.position).toBe(0)
      session.markStale(source, session.snapshot.active!.info.revision)
      expect(find.snapshot.matches).toEqual([])
      expect(find.snapshot.status).toBe('stale')
      await browser.reload()
      await settle(browser)
      expect(find.snapshot.query).toBe('same')
      expect(find.snapshot.matches).toEqual([])
    } finally {
      browser.dispose()
      await session.dispose()
    }
  })
  it('keeps the latest query, bounds history, and restarts after manual navigation cancels work', async () => {
    await validate('[' + Array.from({ length: 180 }, () => '1').join(',') + ']')
    const { session, browser, find } = bridgeFixture()
    try {
      await session.activate(source)
      await settle(browser)
      find.open()
      find.setQuery('absent')
      find.setQuery('1')
      await find.next()
      await settle(browser)
      expect(find.snapshot.query).toBe('1')
      expect(find.snapshot.matches[0].ordinal).toBe(1)
      for (let i = 0; i < 150; i++) await find.next()
      expect(find.snapshot.matches.length).toBeLessThanOrEqual(FIND_LIMITS.history)
      expect(byteSize(find.snapshot.matches)).toBeLessThanOrEqual(FIND_LIMITS.historyBytes)
      expect(find.snapshot.matches[0].ordinal).toBeGreaterThan(1)
      find.setQuery('absent')
      await browser.navigate({ source, pointer: '' as JsonPointer })
      expect(find.snapshot.restartRequired).toBe(true)
      await find.next()
      expect(find.snapshot.status).toBe('no-match')
      session.reset()
      expect(find.snapshot.open).toBe(false)
      expect(find.snapshot.query).toBe('')
    } finally {
      browser.dispose()
      await session.dispose()
    }
  })
  it('cancels an in-flight batch on ordinary navigation, retains history and restarts from the beginning', async () => {
    await validate('[' + Array.from({ length: 180 }, () => '1').join(',') + ']')
    const { session, browser, find, api } = bridgeFixture()
    try {
      await session.activate(source)
      await settle(browser)
      find.open()
      find.setQuery('1')
      await find.next()
      for (let index = 1; index < 32; index++) await find.next()
      const history = find.snapshot.matches
      const original = api.findInSource
      let finish!: () => void
      const gate = new Promise<void>((resolve) => {
        finish = resolve
      })
      let responseReady = false
      api.findInSource = async (input) => {
        const response = await original(input)
        responseReady = true
        await gate
        return response
      }
      const pending = find.next()
      await vi.waitFor(() => expect(responseReady).toBe(true))
      await browser.navigate({ source, pointer: '/0' as JsonPointer })
      expect(find.snapshot.restartRequired).toBe(true)
      expect(find.snapshot.matches).toBe(history)
      expect(find.snapshot.busy).toBe(false)
      finish()
      await pending
      expect(browser.snapshot.current!.address.pointer).toBe('/0')
      api.findInSource = original
      await find.next()
      expect(find.snapshot.position).toBe(0)
      expect(find.snapshot.matches[0].ordinal).toBe(1)
      expect(find.snapshot.restartRequired).toBe(false)
    } finally {
      browser.dispose()
      await session.dispose()
    }
  })
  it('closes the cursor from a late successful response without closing the new query', async () => {
    const { session, browser, find, api } = bridgeFixture()
    try {
      await session.activate(source)
      await settle(browser)
      find.open()
      const original = api.findInSource
      const close = vi.spyOn(api, 'closeSourceFind')
      let finish!: (response: RawResult<FindResult>) => void
      api.findInSource = () =>
        new Promise((resolve) => {
          finish = resolve
        })
      find.setQuery('old')
      const old = find.next()
      await vi.waitFor(() => expect(finish).toBeDefined())
      find.close()
      find.open()
      find.setQuery('same')
      api.findInSource = original
      const newer = find.next()
      const lateCursor = crypto.randomUUID()
      finish({
        ok: true,
        value: {
          source,
          revision: info.revision,
          query: 'old',
          matches: [],
          scannedBytes: 1,
          sizeBytes: 100,
          complete: false,
          nextCursor: lateCursor,
        },
      })
      await old
      await newer
      expect(close).toHaveBeenCalledWith(expect.objectContaining({ cursor: lateCursor }))
      expect(find.snapshot.query).toBe('same')
      expect(find.snapshot.status).toBe('ready')
      expect(find.snapshot.position).toBe(0)
    } finally {
      browser.dispose()
      await session.dispose()
    }
  })
  it('suppresses stale query responses and surfaces errors and oversized queries', async () => {
    const { session, browser, find, api } = bridgeFixture()
    try {
      await session.activate(source)
      await settle(browser)
      find.open()
      let finish!: (result: RawResult<FindResult>) => void
      const original = api.findInSource
      api.findInSource = () =>
        new Promise((resolve) => {
          finish = resolve
        })
      find.setQuery('old')
      const old = find.next()
      await vi.waitFor(() => expect(finish).toBeDefined())
      find.setQuery('same')
      api.findInSource = original
      const latest = find.next()
      finish({ ok: false, error: { code: 'SOURCE_CHANGED' } })
      await old
      await latest
      expect(session.snapshot.active!.info.state).toBe('current')
      expect(find.snapshot.query).toBe('same')
      expect(find.snapshot.position).toBe(0)
      find.setQuery('x'.repeat(1024))
      expect(find.snapshot.error?.details?.limit).toBe('FIND_QUERY_BYTES')
      api.findInSource = async () => ({ ok: false, error: { code: 'SERVICE_EXIT' } })
      find.setQuery('same')
      await find.next()
      expect(find.snapshot.error?.code).toBe('SERVICE_EXIT')
    } finally {
      browser.dispose()
      await session.dispose()
    }
  })
})
