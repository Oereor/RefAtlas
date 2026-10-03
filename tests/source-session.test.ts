import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SourceSession } from '../src/renderer/src/state/source-session'
import { RawDataService } from '../src/utility/raw-service'
import type {
  JsonPointer,
  NodeInput,
  NodeResult,
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

const workspaceId = crypto.randomUUID() as WorkspaceId
const source = (name: string): SourceAddress => ({
  workspaceId,
  relativePath: name as RelativePath,
})
const metadata = (address: SourceAddress): SourceInfo => ({
  source: address,
  revision: crypto.randomUUID() as SourceRevision,
  state: 'current',
  sizeBytes: 2,
  validated: false,
})
const root = (input: NodeInput): RawResult<NodeResult> => ({
  ok: true,
  value: {
    mode: 'summary',
    node: {
      address: input.address,
      revision: input.expectedRevision,
      kind: 'object',
      range: null,
      childCount: null,
      preview: null,
      truncated: true,
    },
  },
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
function fixture() {
  const events: string[] = []
  const partial: Partial<RawBridge> = {
    getSourceInfo: async ({ source: address }) => {
      events.push('info:' + address.relativePath)
      return { ok: true, value: metadata(address) }
    },
    readNode: async (input) => {
      events.push('read:' + input.address.source.relativePath)
      return root(input)
    },
    releaseSource: async ({ source: address }) => {
      events.push('release:' + address.relativePath)
      return { ok: true, value: { released: true } }
    },
    cancelRequest: async () => {
      events.push('cancel')
      return { ok: true, value: { accepted: true } }
    },
  }
  const bridge = partial as RawBridge
  return { bridge, events }
}

describe('SourceSession activation boundary', () => {
  it('commits root before releasing A and reuses the same active address', async () => {
    const { bridge, events } = fixture(),
      session = new SourceSession(bridge)
    await session.activate(source('a.json'))
    const active = session.snapshot.active
    await session.activate(source('a.json'))
    expect(session.snapshot.active).toBe(active)
    expect(events).toEqual(['info:a.json', 'read:a.json'])
    await session.activate(source('b.json'))
    expect(events.slice(-3)).toEqual(['info:b.json', 'read:b.json', 'release:a.json'])
    expect(session.snapshot.active!.root.address.pointer).toBe('')
  })
  it.each<RawCode>([
    'NOT_FOUND',
    'INVALID_JSON',
    'ACCESS_DENIED',
    'RESOURCE_LIMIT',
    'BUSY',
    'TIMEOUT',
    'SERVICE_UNAVAILABLE',
  ])('preserves A and cleans up failed B (%s)', async (code) => {
    const { bridge, events } = fixture(),
      session = new SourceSession(bridge)
    await session.activate(source('a.json'))
    const active = session.snapshot.active
    bridge.readNode = async () => ({ ok: false, error: { code } })
    await session.activate(source('b.json'))
    expect(session.snapshot.active).toBe(active)
    expect(session.snapshot.error?.code).toBe(code)
    expect(events.at(-1)).toBe('release:b.json')
    expect(events).not.toContain('release:a.json')
  })
  it('latest intent wins rapid switching, obsolete success is discarded, and candidate settles before release', async () => {
    const { bridge, events } = fixture(),
      session = new SourceSession(bridge)
    await session.activate(source('a.json'))
    const gate = deferred<RawResult<SourceInfo>>()
    const normal = bridge.getSourceInfo
    bridge.getSourceInfo = async (input) => {
      if (input.source.relativePath !== 'b.json') return normal(input)
      events.push('info:b.json')
      return gate.promise
    }
    const b = session.activate(source('b.json'))
    await flush()
    void session.activate(source('c.json'))
    const d = session.activate(source('d.json'))
    expect(session.snapshot.pending!.relativePath).toBe('d.json')
    expect(session.snapshot.active!.source.relativePath).toBe('a.json')
    gate.resolve({ ok: true, value: metadata(source('b.json')) })
    await Promise.all([b, d])
    expect(session.snapshot.active!.source.relativePath).toBe('d.json')
    expect(events).not.toContain('info:c.json')
    expect(events).not.toContain('read:b.json')
    expect(events.indexOf('release:b.json')).toBeLessThan(events.indexOf('info:d.json'))
  })
  it('returning to active A cancels B without reacquiring or releasing A', async () => {
    const { bridge, events } = fixture(),
      session = new SourceSession(bridge)
    await session.activate(source('a.json'))
    const active = session.snapshot.active
    const gate = deferred<RawResult<SourceInfo>>()
    bridge.getSourceInfo = () => gate.promise
    const b = session.activate(source('b.json'))
    await flush()
    const a = session.activate(source('a.json'))
    gate.resolve({ ok: true, value: metadata(source('b.json')) })
    await Promise.all([a, b])
    expect(session.snapshot.active).toBe(active)
    expect(session.snapshot.pending).toBe(null)
    expect(events.filter((event) => event === 'info:a.json')).toHaveLength(1)
    expect(events).not.toContain('release:a.json')
  })
  it('serializes same-address reacquire behind obsolete candidate cleanup', async () => {
    const { bridge, events } = fixture(),
      session = new SourceSession(bridge)
    const gate = deferred<RawResult<SourceInfo>>(),
      cleanup = deferred<RawResult<{ released: boolean }>>()
    let infoCalls = 0
    bridge.getSourceInfo = async (input) => {
      infoCalls++
      events.push('info')
      return infoCalls === 1 ? gate.promise : { ok: true, value: metadata(input.source) }
    }
    bridge.releaseSource = () => {
      events.push('release')
      return cleanup.promise
    }
    const old = session.activate(source('a.json'))
    await flush()
    const fresh = session.activate(source('a.json'))
    gate.resolve({ ok: true, value: metadata(source('a.json')) })
    await flush()
    expect(infoCalls).toBe(1)
    cleanup.resolve({ ok: true, value: { released: true } })
    await Promise.all([old, fresh])
    expect(events.slice(0, 3)).toEqual(['info', 'cancel', 'release'])
    expect(infoCalls).toBe(2)
    expect(session.snapshot.active!.source.relativePath).toBe('a.json')
  })
  it('workspace reset prevents an obsolete root from committing', async () => {
    const { bridge } = fixture(),
      session = new SourceSession(bridge),
      gate = deferred<RawResult<NodeResult>>()
    let input!: NodeInput
    bridge.readNode = async (value) => {
      input = value
      return gate.promise
    }
    const activation = session.activate(source('a.json'))
    await flush()
    session.reset()
    gate.resolve(root(input))
    await activation
    expect(session.snapshot.active).toBe(null)
    expect(session.snapshot.error).toBe(null)
  })
  it('uses real source acquisition/root validation/release and preserves active after invalid JSON', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'refatlas-session-')),
      service = new RawDataService()
    const controllers = new Map<string, AbortController>()
    async function execute<T extends RawOutput>(
      requestId: string,
      command: RawCommand,
    ): Promise<RawResult<T>> {
      const controller = new AbortController()
      controllers.set(requestId, controller)
      try {
        return { ok: true, value: (await service.execute(command, controller.signal)) as T }
      } catch (error) {
        return { ok: false, error: { code: (error as { code: RawCode }).code } }
      } finally {
        controllers.delete(requestId)
      }
    }
    try {
      await writeFile(join(directory, 'a.json'), '{"n":16752756560315677817}')
      await writeFile(join(directory, 'b.json'), '[]')
      await writeFile(join(directory, 'bad.json'), '{')
      const opened = (await service.execute(
        { kind: 'open', root: directory },
        new AbortController().signal,
      )) as { workspaceId: WorkspaceId }
      const bridge = {
        getSourceInfo: ({ requestId, source }) => execute(requestId, { kind: 'info', source }),
        readNode: ({ requestId, address, expectedRevision }) =>
          execute(requestId, { kind: 'read', address, expectedRevision }),
        releaseSource: ({ requestId, source }) => execute(requestId, { kind: 'release', source }),
        cancelRequest: async (id) => {
          controllers.get(id)?.abort()
          return { ok: true, value: { accepted: true } }
        },
      } as RawBridge
      const session = new SourceSession(bridge),
        address = (name: string) => ({
          workspaceId: opened.workspaceId,
          relativePath: name as RelativePath,
        })
      await session.activate(address('a.json'))
      const a = session.snapshot.active!
      await session.activate(address('bad.json'))
      expect(session.snapshot.active).toBe(a)
      expect(session.snapshot.error?.code).toBe('INVALID_JSON')
      await session.activate(address('b.json'))
      expect(session.snapshot.active!.root.kind).toBe('array')
      const oldRead = await bridge.readNode({
        requestId: crypto.randomUUID(),
        address: { source: a.source, pointer: '' as JsonPointer },
        expectedRevision: a.info.revision,
      })
      expect(oldRead).toEqual({ ok: false, error: { code: 'SOURCE_CHANGED' } })
      expect(
        await bridge.releaseSource({ requestId: crypto.randomUUID(), source: address('bad.json') }),
      ).toEqual({ ok: true, value: { released: false } })
    } finally {
      service.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
