import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, unlink } from 'node:fs/promises'
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
  let session: SourceSession | undefined
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
      reloadSource: ({ requestId, source }) =>
        execute<SourceInfo>(requestId, { kind: 'reload', source }),
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
    session = new SourceSession(api)
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
    await session?.dispose()
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
  it.each(['read', 'children', 'segment'])(
    'real mutation causes request-time stale in %s and blocks reads',
    async (method) => {
      const fixture =
        method === 'segment'
          ? JSON.stringify('x'.repeat(60000))
          : '[' + Array.from({ length: 205 }, (_, i) => i).join(',') + ']'
      await withService(fixture, async ({ browser, session, file, api }) => {
        const before = browser.snapshot.children
        const current = browser.snapshot.current,
          segment = browser.snapshot.segment
        await writeFile(file, '[4,5,6,7]')
        if (method === 'read') await browser.openChild(before[0])
        else await browser.next()
        expect(session.snapshot.active!.info.state).toBe('stale')
        expect(browser.snapshot.error?.code).toBe('SOURCE_CHANGED')
        expect(browser.snapshot.current).toBe(current)
        expect(browser.snapshot.children).toBe(before)
        expect(browser.snapshot.segment).toBe(segment)
        api.readNode =
          api.listNodeChildren =
          api.readScalarSegment =
            async () => {
              throw Error('stale must not issue reads')
            }
        await browser.parent()
        await browser.restart()
        await browser.openChild(before[1])
        expect(browser.snapshot.current?.address.pointer).toBe('')
      })
    },
  )
})

describe('revision location recovery with real RawDataService', () => {
  const navigate = (browser: NodeBrowserController, pointer: string) =>
    browser.navigate({
      source: browser.snapshot.source!,
      pointer: pointer as JsonPointer,
    })
  async function reload(browser: NodeBrowserController, session: SourceSession) {
    const old = session.snapshot.active!
    session.markStale(old.source, old.info.revision)
    await browser.reload()
    await settled(browser)
  }
  it('monitoring detects real mutation without navigation, retains old scalar, then recovers its exact Pointer', async () => {
    await withService('{"a":{"b":1}}', async ({ browser, session, file }) => {
      await navigate(browser, '/a/b')
      const old = browser.snapshot.current!,
        scalar = browser.snapshot.scalar
      session.setMonitoringVisible(true)
      await writeFile(file, '{"a":{"b":22}}')
      await vi.waitFor(() => expect(session.snapshot.active!.info.state).toBe('stale'))
      expect(browser.snapshot.current).toBe(old)
      expect(browser.snapshot.scalar).toBe(scalar)
      await browser.reload()
      await settled(browser)
      expect(browser.snapshot.location).toBe('READY')
      expect(browser.snapshot.current!.address.pointer).toBe('/a/b')
      expect(browser.snapshot.scalar).toEqual({ kind: 'number', lexeme: '22' })
      expect(browser.snapshot.revision).not.toBe(old.revision)
      await session.dispose()
    })
  })
  it('reports application LOCATION_MISSING on a current source, without jumping to root', async () => {
    await withService('{"a":{"b":1}}', async ({ browser, session, file }) => {
      await navigate(browser, '/a/b')
      await writeFile(file, '{"a":{"c":2}}')
      await reload(browser, session)
      expect(session.snapshot.active!.info.state).toBe('current')
      expect(browser.snapshot.location).toBe('LOCATION_MISSING')
      expect(browser.snapshot.recoveryPointer).toBe('/a/b')
      expect(browser.snapshot.current).toBeNull()
      expect(browser.snapshot.error).toBeNull()
      expect(browser.snapshot.children).toEqual([])
      await browser.returnToRoot()
      expect(browser.snapshot.current!.address.pointer).toBe('')
      expect(browser.snapshot.location).toBe('READY')
      expect(browser.snapshot.history[0].number).toBe(1)
    })
  })
  it('keeps /0 after array insertion, without following the old id value to /1', async () => {
    await withService('[{"id":1}]', async ({ browser, session, file }) => {
      await navigate(browser, '/0')
      await writeFile(file, '[{"id":2},{"id":1}]')
      await reload(browser, session)
      expect(browser.snapshot.current!.address.pointer).toBe('/0')
      expect(browser.snapshot.children[0].node.preview).toBe('2')
      expect(browser.snapshot.selectedChild).toBeNull()
      expect(browser.snapshot.context).toBeNull()
    })
  })
  it.each(['deleted', 'invalid-json', 'inaccessible'] as const)(
    'retains old stale view on file-level reload failure: %s',
    async (mode) => {
      await withService('{"a":{"b":1}}', async ({ browser, session, api, file }) => {
        await navigate(browser, '/a/b')
        const current = browser.snapshot.current,
          scalar = browser.snapshot.scalar,
          revision = browser.snapshot.revision
        if (mode === 'deleted') await unlink(file)
        else if (mode === 'invalid-json') await writeFile(file, '{')
        else api.reloadSource = async () => ({ ok: false, error: { code: 'ACCESS_DENIED' } })
        await reload(browser, session)
        expect(session.snapshot.error?.code).toBe(
          mode === 'deleted'
            ? 'NOT_FOUND'
            : mode === 'invalid-json'
              ? 'INVALID_JSON'
              : 'ACCESS_DENIED',
        )
        expect(session.snapshot.active!.info.state).toBe('stale')
        expect(browser.snapshot.revision).toBe(revision)
        expect(browser.snapshot.current).toBe(current)
        expect(browser.snapshot.scalar).toBe(scalar)
        expect(browser.snapshot.location).not.toBe('LOCATION_MISSING')
      })
    },
  )
  it('does not confuse a file disappearing during recovery with a missing Pointer', async () => {
    await withService('{"a":{"b":1}}', async ({ browser, session, api, file }) => {
      await navigate(browser, '/a/b')
      await writeFile(file, '{"a":{"b":2}}')
      const read = api.readNode
      api.readNode = async (input) => {
        if (input.address.pointer === '/a/b') {
          await unlink(file)
          // The raw open boundary can report NOT_FOUND after verification.
          return { ok: false, error: { code: 'NOT_FOUND' } }
        }
        return read(input)
      }
      await reload(browser, session)
      expect(session.snapshot.active!.info.state).toBe('stale')
      expect(browser.snapshot.location).toBe('ERROR')
      expect(browser.snapshot.recoveryPointer).toBe('/a/b')
      expect(browser.snapshot.location).not.toBe('LOCATION_MISSING')
    })
  })
  it('resets children page, selection, context and cursors on the new revision', async () => {
    const text = '[' + Array.from({ length: 205 }, (_, i) => String(i)).join(',') + ']'
    await withService(text, async ({ browser, session, file }) => {
      await browser.next()
      browser.select(browser.snapshot.children[0])
      const oldCursor = browser.snapshot.nextCursor
      await writeFile(file, text + ' ')
      await reload(browser, session)
      expect(browser.snapshot.children[0].ordinal).toBe(0)
      expect(browser.snapshot.history).toEqual([{ cursor: null, number: 1 }])
      expect(browser.snapshot.selectedChild).toBeNull()
      expect(browser.snapshot.context).toBeNull()
      expect(browser.snapshot.nextCursor).not.toBe(oldCursor)
    })
  })
  it('restarts scalar segmentation and drops cursor history after reload', async () => {
    await withService('"' + 'x'.repeat(60000) + '"', async ({ browser, session, file }) => {
      await browser.next()
      expect(browser.snapshot.history[browser.snapshot.position].number).toBe(2)
      const old = browser.snapshot.segment
      await writeFile(file, '"' + 'y'.repeat(60000) + '"')
      await reload(browser, session)
      expect(browser.snapshot.segment!.text).toBe('y'.repeat(4096))
      expect(browser.snapshot.segment).not.toBe(old)
      expect(browser.snapshot.position).toBe(0)
      expect(browser.snapshot.history).toEqual([{ cursor: null, number: 1 }])
    })
  })
  it('recovers the committed Pointer and ignores an old revision request/finally after reload', async () => {
    await withService('{"a":{"b":1,"c":5}}', async ({ browser, session, api, file }) => {
      await navigate(browser, '/a/b')
      const read = api.readNode,
        gate = deferred<RawResult<NodeResult>>()
      api.readNode = (input) => (input.address.pointer === '/a/c' ? gate.promise : read(input))
      const navigation = navigate(browser, '/a/c')
      await flush()
      await writeFile(file, '{"a":{"b":2,"c":6}}')
      const oldRevision = browser.snapshot.revision
      session.markStale(session.snapshot.active!.source, oldRevision!)
      const transaction = browser.reload()
      await vi.waitFor(() => expect(session.snapshot.active!.info.revision).not.toBe(oldRevision))
      expect(browser.snapshot.location).toBe('RECOVERING')
      gate.resolve({ ok: false, error: { code: 'SOURCE_CHANGED' } })
      await Promise.all([navigation, transaction])
      expect(browser.snapshot.location).toBe('READY')
      expect(browser.snapshot.current!.address.pointer).toBe('/a/b')
      expect(browser.snapshot.scalar).toEqual({ kind: 'number', lexeme: '2' })
      expect(session.snapshot.active!.info.state).toBe('current')
      expect(browser.snapshot.error).toBeNull()
      expect(browser.snapshot.busy).toBe(false)
    })
  })
  it('allows a new source reload while an obsolete recovery request is still settling', async () => {
    await withService('{"a":{"b":1}}', async ({ browser, session, api, file }) => {
      await navigate(browser, '/a/b')
      const read = api.readNode,
        gate = deferred<RawResult<NodeResult>>()
      let entered = false
      api.readNode = (input) => {
        if (input.address.pointer === '/a/b') {
          entered = true
          return gate.promise
        }
        return read(input)
      }
      session.markStale(session.snapshot.active!.source, browser.snapshot.revision!)
      const oldReload = browser.reload()
      await vi.waitFor(() => expect(entered).toBe(true))
      await writeFile(join(file, '..', 'other.json'), 'true')
      await session.activate({
        ...session.snapshot.active!.source,
        relativePath: 'other.json' as RelativePath,
      })
      const oldBRevision = browser.snapshot.revision
      session.markStale(session.snapshot.active!.source, oldBRevision!)
      const freshReload = browser.reload()
      expect(freshReload).not.toBe(oldReload)
      await freshReload
      expect(browser.snapshot.revision).not.toBe(oldBRevision)
      gate.resolve({ ok: false, error: { code: 'SOURCE_CHANGED' } })
      await oldReload
      expect(browser.snapshot.source!.relativePath).toBe('other.json')
      expect(browser.snapshot.scalar).toEqual({ kind: 'boolean', value: true })
      expect(session.snapshot.active!.info.state).toBe('current')
    })
  })
  it.each(['source', 'workspace'] as const)(
    'rejects late recovery response/finally after %s switch',
    async (mode) => {
      await withService('{"a":{"b":1}}', async ({ browser, session, api, file }) => {
        await navigate(browser, '/a/b')
        await writeFile(file, '{"a":{"b":2}}')
        const read = api.readNode,
          gate = deferred<RawResult<NodeResult>>()
        let recoveryInput!: NodeInput
        api.readNode = (input) => {
          if (input.address.pointer === '/a/b') {
            recoveryInput = input
            return gate.promise
          }
          return read(input)
        }
        session.markStale(session.snapshot.active!.source, browser.snapshot.revision!)
        const transaction = browser.reload()
        expect(browser.reload()).toBe(transaction)
        await vi.waitFor(() => expect(recoveryInput).toBeDefined())
        expect(browser.snapshot.location).toBe('RECOVERING')
        if (mode === 'workspace') session.reset()
        else {
          const other = {
            ...session.snapshot.active!.source,
            relativePath: 'other.json' as RelativePath,
          }
          await writeFile(join(file, '..', 'other.json'), 'true')
          await session.activate(other)
        }
        const fresh = browser.snapshot
        gate.resolve({ ok: false, error: { code: 'SOURCE_CHANGED' } })
        await transaction
        expect(browser.snapshot).toBe(fresh)
        expect(session.snapshot.active?.info.state).not.toBe('stale')
      })
    },
  )
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
