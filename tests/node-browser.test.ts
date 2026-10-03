import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  NodeBrowserController,
  NODE_BROWSER_LIMITS,
} from '../src/renderer/src/browser/node-browser-controller'
import { scalarText } from '../src/renderer/src/browser/node-browser-model'
import { SourceSession } from '../src/renderer/src/state/source-session'
import { RawDataService } from '../src/utility/raw-service'
import { joinPointer, splitPointer } from '../src/shared/raw'
import type {
  ChildrenResult,
  JsonPointer,
  NodeInput,
  NodeResult,
  NodeSummary,
  RawBridge,
  RawCode,
  RawCommand,
  RawOutput,
  RawResult,
  RelativePath,
  SourceAddress,
  SourceInfo,
  SourceRevision,
  WorkspaceId,
} from '../src/shared/raw'
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
async function settled(browser: NodeBrowserController) {
  for (let i = 0; browser.snapshot.busy && i < 100; i++)
    await new Promise((resolve) => setTimeout(resolve, 5))
  expect(browser.snapshot.busy).toBe(false)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function mock() {
  const workspaceId = crypto.randomUUID() as WorkspaceId
  const address = (name = 'a.json'): SourceAddress => ({
    workspaceId,
    relativePath: name as RelativePath,
  })
  const root = (input: NodeInput, kind: NodeSummary['kind'] = 'array'): RawResult<NodeResult> => ({
    ok: true,
    value: {
      mode: 'summary',
      node: {
        address: input.address,
        revision: input.expectedRevision,
        kind,
        range: null,
        childCount: null,
        preview: null,
        truncated: true,
      },
    },
  })
  const events: string[] = []
  const partial: Partial<RawBridge> = {
    getSourceInfo: async ({ source }) => ({
      ok: true,
      value: {
        source,
        revision: crypto.randomUUID() as SourceRevision,
        state: 'current',
        validated: false,
        sizeBytes: 2,
      },
    }),
    releaseSource: async () => ({ ok: true, value: { released: true } }),
    cancelRequest: async (id) => {
      events.push('cancel:' + id)
      return { ok: true, value: { accepted: true } }
    },
    readNode: async (input) => root(input),
    listNodeChildren: async (input) => {
      events.push('children:' + input.address.source.relativePath + ':' + input.cursor)
      const ordinal = input.cursor ? 100 : 0
      const result = root({
        ...input,
        address: { ...input.address, pointer: ('/' + ordinal) as JsonPointer },
      })
      if (!result.ok) throw Error('fixture')
      return {
        ok: true,
        value: {
          address: input.address,
          revision: input.expectedRevision,
          items: [
            {
              ordinal,
              key: ordinal,
              node: { ...result.value.node, kind: 'number', preview: String(ordinal) },
            },
          ],
          nextCursor: crypto.randomUUID(),
          truncated: true,
        },
      }
    },
    readScalarSegment: async (input) => ({
      ok: true,
      value: {
        address: input.address,
        revision: input.expectedRevision,
        kind: 'string',
        text: '🙂',
        nextCursor: crypto.randomUUID(),
        truncated: true,
      },
    }),
  }
  const api = partial as RawBridge
  const session = new SourceSession(api),
    browser = new NodeBrowserController(api, session)
  return { api, session, browser, address, root, events }
}
async function withService(
  text: string,
  run: (f: {
    browser: NodeBrowserController
    session: SourceSession
    api: RawBridge
    file: string
  }) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), 'refatlas-node-browser-')),
    service = new RawDataService()
  const controllers = new Map<string, AbortController>(),
    file = join(directory, 'source.json')
  let browser: NodeBrowserController | undefined
  const execute = async <T extends RawOutput>(
    id: string,
    command: RawCommand,
  ): Promise<RawResult<T>> => {
    const controller = new AbortController()
    controllers.set(id, controller)
    try {
      return { ok: true, value: (await service.execute(command, controller.signal)) as T }
    } catch (error) {
      return { ok: false, error: { code: (error as { code: RawCode }).code } }
    } finally {
      controllers.delete(id)
    }
  }
  try {
    await writeFile(file, text)
    const opened = (await service.execute(
      { kind: 'open', root: directory },
      new AbortController().signal,
    )) as { workspaceId: WorkspaceId }
    const api = {
      getSourceInfo: ({ requestId, source }) =>
        execute<SourceInfo>(requestId, { kind: 'info', source }),
      readNode: ({ requestId, ...rest }) =>
        execute<NodeResult>(requestId, { kind: 'read', ...rest }),
      listNodeChildren: ({ requestId, ...rest }) =>
        execute<ChildrenResult>(requestId, { kind: 'children', ...rest }),
      readScalarSegment: ({ requestId, ...rest }) =>
        execute(requestId, { kind: 'segment', ...rest }),
      releaseSource: ({ requestId, source }) => execute(requestId, { kind: 'release', source }),
      cancelRequest: async (id: string) => {
        controllers.get(id)?.abort()
        return { ok: true, value: { accepted: true } }
      },
    } as RawBridge
    const session = new SourceSession(api)
    browser = new NodeBrowserController(api, session)
    await session.activate({
      workspaceId: opened.workspaceId,
      relativePath: 'source.json' as RelativePath,
    })
    await settled(browser)
    expect(session.snapshot.error).toBe(null)
    await run({ browser, session, api, file })
  } finally {
    browser?.dispose()
    service.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}
describe('NodeBrowser real raw composition', () => {
  it.each(['1.00', '-0', '1e+3', '16752756560315677817', '"中文🙂\\n"', 'true', 'null'])(
    'retains complete root scalar %s',
    async (text) => {
      await withService(text, async ({ browser, session }) => {
        expect(browser.snapshot.current?.address.pointer).toBe('')
        expect(browser.snapshot.scalar).toEqual(session.snapshot.active!.rootScalar)
        expect(scalarText(browser.snapshot.scalar!)).toBe(text.startsWith('"') ? '中文🙂\n' : text)
        expect(browser.snapshot.children).toEqual([])
        expect(browser.snapshot.history).toEqual([])
      })
    },
  )
  it('uses children for small containers and preserves special keys, context and encoded pointers', async () => {
    await withService(
      '{"0":{"":1.00},"a~b/c":"中文🙂","empty":{},"array":[true,null]}',
      async ({ browser, session }) => {
        expect(session.snapshot.active!.rootScalar).toBe(null)
        browser.select(browser.snapshot.children[0])
        expect(browser.snapshot.current?.address.pointer).toBe('')
        expect(browser.snapshot.selectedChild?.key).toBe('0')
        await browser.openChild()
        expect(browser.snapshot.context).toEqual({ parentKind: 'object', key: '0' })
        expect(browser.snapshot.selectedChild).toBe(null)
        await browser.openChild(browser.snapshot.children[0])
        expect(browser.snapshot.current?.address.pointer).toBe('/0/')
        expect(browser.snapshot.scalar).toEqual({ kind: 'number', lexeme: '1.00' })
        expect(splitPointer(browser.snapshot.current!.address.pointer)).toEqual(['0', ''])
        await browser.navigate({
          ...browser.snapshot.current!.address,
          pointer: joinPointer(['a~b/c']),
        })
        expect(browser.snapshot.current?.address.pointer).toBe('/a~0b~1c')
        expect(browser.snapshot.context).toBe(null)
        expect(browser.snapshot.scalar).toEqual({ kind: 'string', value: '中文🙂' })
        await browser.navigate({
          ...browser.snapshot.current!.address,
          pointer: '/empty' as JsonPointer,
        })
        expect(browser.snapshot.children).toEqual([])
        expect(browser.snapshot.current?.childCount).toBe(0)
        await browser.navigate({
          ...browser.snapshot.current!.address,
          pointer: '/array' as JsonPointer,
        })
        await browser.openChild(browser.snapshot.children[1])
        expect(browser.snapshot.context).toEqual({ parentKind: 'array', key: 1 })
        expect(browser.snapshot.scalar).toEqual({ kind: 'null' })
        await browser.parent()
        expect(browser.snapshot.current?.address.pointer).toBe('/array')
      },
    )
  })
  it('replaces children pages and Previous reuses opaque request cursors including short last page', async () => {
    await withService(
      '[' + Array.from({ length: 205 }, (_, i) => i).join(',') + ']',
      async ({ browser }) => {
        const first = browser.snapshot.children
        browser.select(first[2])
        await browser.next()
        expect(browser.snapshot.children[0].ordinal).toBe(100)
        expect(browser.snapshot.children).toHaveLength(100)
        expect(browser.snapshot.selectedChild).toBe(null)
        await browser.next()
        expect(browser.snapshot.children).toHaveLength(5)
        expect(browser.snapshot.nextCursor).toBe(null)
        await browser.previous()
        expect(browser.snapshot.children[0].ordinal).toBe(100)
        await browser.previous()
        expect(browser.snapshot.children).toEqual(first)
      },
    )
  })
  it.each(['string', 'number'])('replaces bounded %s segments with exact text', async (kind) => {
    const text = kind === 'string' ? '🙂中文'.repeat(20000) : '1'.repeat(60000)
    await withService(kind === 'string' ? JSON.stringify(text) : text, async ({ browser }) => {
      expect(browser.snapshot.scalar).toBe(null)
      const first = browser.snapshot.segment!.text
      expect([...first]).toHaveLength(4096)
      await browser.next()
      expect(browser.snapshot.segment!.text).toBe(
        kind === 'number' ? text.slice(4096, 8192) : [...text].slice(4096, 8192).join(''),
      )
      await browser.previous()
      expect(browser.snapshot.segment!.text).toBe(first)
      expect(browser.snapshot.segment!.kind).toBe(kind)
    })
  })
  it('real mutation makes session stale and prevents further reads', async () => {
    await withService('[1,2,3]', async ({ browser, session, file, api }) => {
      const before = browser.snapshot.children
      await writeFile(file, '[4,5,6,7]')
      await browser.openChild(before[0])
      expect(session.snapshot.active!.info.state).toBe('stale')
      expect(browser.snapshot.children).toBe(before)
      api.readNode = async () => {
        throw Error('stale must not issue reads')
      }
      await browser.parent()
      await browser.restart()
      await browser.openChild(before[1])
      expect(browser.snapshot.current?.address.pointer).toBe('')
    })
  })
})
describe('NodeBrowser races, errors and bounds', () => {
  it('waits for an obsolete read to settle and executes only the latest navigation', async () => {
    const { api, session, browser, address, root } = mock()
    await session.activate(address())
    await settled(browser)
    const gate = deferred<RawResult<NodeResult>>()
    const inputs: NodeInput[] = []
    api.readNode = (input) => {
      inputs.push(input)
      return inputs.length === 1 ? gate.promise : Promise.resolve(root(input, 'object'))
    }
    const a = browser.navigate({ source: address(), pointer: '/a' as JsonPointer })
    await flush()
    const b = browser.navigate({ source: address(), pointer: '/b' as JsonPointer })
    const c = browser.navigate({ source: address(), pointer: '/c' as JsonPointer })
    await flush()
    expect(inputs.map((input) => input.address.pointer)).toEqual(['/a'])
    expect(browser.snapshot.current?.address.pointer).toBe('')
    gate.resolve(root(inputs[0], 'object'))
    await Promise.all([a, b, c])
    expect(inputs.map((input) => input.address.pointer)).toEqual(['/a', '/c'])
    expect(browser.snapshot.current?.address.pointer).toBe('/c')
    expect(browser.snapshot.busy).toBe(false)
    browser.dispose()
  })
  it('cancels obsolete queued navigation and returns to current without reread', async () => {
    const { api, session, browser, address, root, events } = mock()
    await session.activate(address())
    await settled(browser)
    const gate = deferred<RawResult<NodeResult>>(),
      inputs: NodeInput[] = []
    api.readNode = (input) => {
      inputs.push(input)
      return gate.promise
    }
    const old = browser.navigate({ source: address(), pointer: '/a' as JsonPointer })
    await flush()
    const queued = browser.navigate({ source: address(), pointer: '/b' as JsonPointer })
    await browser.navigate({ source: address(), pointer: '' as JsonPointer })
    gate.resolve(root(inputs[0], 'object'))
    await Promise.all([old, queued])
    expect(inputs).toHaveLength(1)
    expect(events.some((v) => v.startsWith('cancel:'))).toBe(true)
    expect(browser.snapshot.current!.address.pointer).toBe('')
    expect(browser.snapshot.error).toBe(null)
    browser.dispose()
  })
  it('source switch discards old pending response/finally and stale notification', async () => {
    const { api, session, browser, address, root } = mock()
    await session.activate(address())
    await settled(browser)
    const gate = deferred<RawResult<NodeResult>>()
    let oldInput!: NodeInput
    api.readNode = (input) =>
      input.address.pointer ? ((oldInput = input), gate.promise) : Promise.resolve(root(input))
    const old = browser.navigate({ source: address(), pointer: '/old' as JsonPointer })
    await flush()
    await session.activate(address('b.json'))
    gate.resolve(root(oldInput))
    await old
    await settled(browser)
    expect(browser.snapshot.source).toEqual(address('b.json'))
    expect(browser.snapshot.current?.address.pointer).toBe('')
    expect(browser.snapshot.children[0].node.address.source).toEqual(address('b.json'))
    session.markStale(address(), oldInput.expectedRevision)
    expect(session.snapshot.active!.info.state).toBe('current')
    browser.dispose()
  })
  it.each<RawCode>([
    'NOT_FOUND',
    'INVALID_JSON',
    'RESOURCE_LIMIT',
    'ACCESS_DENIED',
    'CANCELLED',
    'BUSY',
    'TIMEOUT',
    'SERVICE_UNAVAILABLE',
    'SERVICE_EXIT',
  ])('retains current on %s and retries', async (code) => {
    const { api, session, browser, address, root } = mock()
    await session.activate(address())
    await settled(browser)
    const before = browser.snapshot.current
    api.readNode = async () => ({ ok: false, error: { code } })
    await browser.navigate({ source: address(), pointer: '/child' as JsonPointer })
    expect(browser.snapshot.current).toBe(before)
    expect(browser.snapshot.error?.code).toBe(code)
    api.readNode = async (input) => root(input, 'object')
    await browser.retry()
    expect(browser.snapshot.current?.address.pointer).toBe('/child')
    browser.dispose()
  })
  it('retains page and selection on failure and explicitly restarts stale cursor', async () => {
    const { api, session, browser, address, events } = mock()
    await session.activate(address())
    await settled(browser)
    const first = browser.snapshot.children,
      original = api.listNodeChildren
    browser.select(first[0])
    api.listNodeChildren = async () => ({ ok: false, error: { code: 'TIMEOUT' } })
    await browser.next()
    expect(browser.snapshot.children).toBe(first)
    expect(browser.snapshot.selectedChild).toBe(first[0])
    api.listNodeChildren = original
    await browser.retry()
    expect(browser.snapshot.children[0].ordinal).toBe(100)
    const second = browser.snapshot.children
    api.listNodeChildren = async () => ({ ok: false, error: { code: 'STALE_CURSOR' } })
    await browser.previous()
    expect(browser.snapshot.children).toBe(second)
    const count = events.length
    await browser.next()
    expect(events).toHaveLength(count)
    expect(session.snapshot.active!.info.state).toBe('current')
    api.listNodeChildren = original
    await browser.restart()
    expect(browser.snapshot.children[0].ordinal).toBe(0)
    browser.dispose()
  })
  it.each(['read', 'children', 'segment'])(
    'SOURCE_CHANGED in %s disables new reads but preserves view',
    async (method) => {
      const { api, session, browser, address, root } = mock()
      if (method === 'segment') api.readNode = async (input) => root(input, 'string')
      await session.activate(address())
      await settled(browser)
      const before = browser.snapshot.current,
        payload = method === 'segment' ? browser.snapshot.segment : browser.snapshot.children
      const failure = async () => ({
        ok: false as const,
        error: { code: 'SOURCE_CHANGED' as const },
      })
      if (method === 'read') {
        api.readNode = failure
        await browser.navigate({ source: address(), pointer: '/0' as JsonPointer })
      } else if (method === 'children') {
        api.listNodeChildren = failure
        await browser.next()
      } else {
        api.readScalarSegment = failure
        await browser.next()
      }
      expect(session.snapshot.active!.info.state).toBe('stale')
      expect(browser.snapshot.current).toBe(before)
      expect(method === 'segment' ? browser.snapshot.segment : browser.snapshot.children).toBe(
        payload,
      )
      api.readNode =
        api.listNodeChildren =
        api.readScalarSegment =
          async () => {
            throw Error('no reads')
          }
      await browser.next()
      await browser.previous()
      await browser.restart()
      await browser.retry()
      await browser.navigate({ source: address(), pointer: '/1' as JsonPointer })
      expect(browser.snapshot.busy).toBe(false)
      browser.dispose()
    },
  )
  it('bounds cursor metadata and payload independently and restarts at null', async () => {
    const { session, browser, address } = mock()
    await session.activate(address())
    await settled(browser)
    for (let i = 0; i < 130; i++) await browser.next()
    expect(browser.snapshot.history).toHaveLength(NODE_BROWSER_LIMITS.history)
    expect(browser.snapshot.history[0].number).toBe(4)
    expect(browser.snapshot.children).toHaveLength(1)
    for (let i = 0; i < 127; i++) await browser.previous()
    const before = browser.snapshot
    await browser.previous()
    expect(browser.snapshot).toBe(before)
    await browser.restart()
    expect(browser.snapshot.history).toEqual([{ cursor: null, number: 1 }])
    browser.dispose()
  })
})
