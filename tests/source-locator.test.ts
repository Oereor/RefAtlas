import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SourceLocatorController } from '../src/renderer/src/locator/source-locator-controller'
import { SourceSession } from '../src/renderer/src/state/source-session'
import { WorkspaceController } from '../src/renderer/src/state/workspace-controller'
import { RawDataService } from '../src/utility/raw-service'
import { commandFromInput } from '../src/shared/raw'
import type {
  LocatorInput,
  LocatorResult,
  OpenResult,
  RawBridge,
  RawOutput,
  RawResult,
  WorkspaceId,
} from '../src/shared/raw'

const workspaceId = crypto.randomUUID() as WorkspaceId
const generation = crypto.randomUUID()
const flush = async () => {
  for (let index = 0; index < 15; index++) await Promise.resolve()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  return {
    promise: new Promise<T>((done) => (resolve = done)),
    resolve: (value: T) => resolve(value),
  }
}
function result(
  input: LocatorInput,
  status: 'building' | 'ready' = 'ready',
  names: string[] = input.query ? [input.query + '.json'] : [],
): RawResult<LocatorResult> {
  return {
    ok: true,
    value: {
      workspaceId: input.workspaceId,
      catalogGeneration: generation,
      query: input.query,
      status,
      items:
        status === 'ready'
          ? names.map((name) => ({
              name,
              source: { workspaceId: input.workspaceId, relativePath: name as never },
            }))
          : [],
      truncated: false,
    },
  }
}
const owned: SourceLocatorController[] = []
function fixture(locateSources: RawBridge['locateSources'] = async (input) => result(input)) {
  const partial: Partial<RawBridge> = {
    locateSources,
    refreshSourceCatalog: async () => ({
      ok: true,
      value: { workspaceId, catalogGeneration: generation },
    }),
    cancelRequest: vi.fn(async () => ({ ok: true as const, value: { accepted: true } })),
  }
  const bridge = partial as RawBridge,
    session = new SourceSession(bridge),
    locator = new SourceLocatorController(bridge, session)
  locator.reset(workspaceId)
  owned.push(locator)
  return { bridge, session, locator }
}
afterEach(() => {
  for (const locator of owned.splice(0)) locator.close()
  vi.useRealTimers()
})

describe('Source Locator latest intent and presentation state', () => {
  it('keeps empty query as a prompt, updates results and clamps keyboard selection', async () => {
    const { locator } = fixture(async (input) =>
      result(input, 'ready', input.query ? ['a.json', 'b.json'] : []),
    )
    locator.open()
    await flush()
    expect(locator.snapshot.status).toBe('ready')
    expect(locator.snapshot.items).toEqual([])
    locator.setQuery('json')
    await flush()
    expect(locator.snapshot.selected).toBe(0)
    locator.move(-1)
    expect(locator.snapshot.selected).toBe(0)
    locator.move(1)
    locator.move(1)
    expect(locator.snapshot.selected).toBe(1)
    locator.close()
    expect(locator.snapshot.open).toBe(false)
    expect(locator.snapshot.query).toBe('')
  })
  it('cancels and drains old input, executes only latest query and ignores old response/finally', async () => {
    const late = deferred<RawResult<LocatorResult>>(),
      inputs: LocatorInput[] = []
    const { locator, bridge } = fixture(async (input) => {
      inputs.push(input)
      return inputs.length === 1 ? late.promise : result(input)
    })
    locator.open()
    locator.setQuery('A')
    locator.setQuery('Av')
    locator.setQuery('AvatarSkill')
    expect(inputs).toHaveLength(1)
    expect(bridge.cancelRequest).toHaveBeenCalled()
    late.resolve(result(inputs[0]))
    await flush()
    expect(inputs.map((input) => input.query)).toEqual(['', 'AvatarSkill'])
    expect(locator.snapshot.items[0].name).toBe('AvatarSkill.json')
    expect(locator.snapshot.status).toBe('ready')
  })
  it('polls building only while open and applies latest query after readiness', async () => {
    vi.useFakeTimers()
    let building = true
    const calls: string[] = []
    const { locator } = fixture(async (input) => {
      calls.push(input.query)
      return result(input, building ? 'building' : 'ready')
    })
    locator.open()
    await flush()
    expect(locator.snapshot.status).toBe('building')
    locator.setQuery('MonsterSkill')
    await flush()
    building = false
    await vi.advanceTimersByTimeAsync(250)
    expect(locator.snapshot.items[0].name).toBe('MonsterSkill.json')
    locator.close()
    const count = calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toHaveLength(count)
  })
  it('survives close/reopen and workspace reset while old work is settling', async () => {
    const late = deferred<RawResult<LocatorResult>>(),
      inputs: LocatorInput[] = []
    const { locator } = fixture(async (input) => {
      inputs.push(input)
      return inputs.length === 1 ? late.promise : result(input)
    })
    locator.open()
    locator.close()
    locator.reset(crypto.randomUUID() as WorkspaceId)
    locator.open()
    locator.setQuery('new')
    late.resolve(result(inputs[0]))
    await flush()
    expect(locator.snapshot.items[0].source.workspaceId).toBe(locator.snapshot.workspaceId)
    expect(locator.snapshot.query).toBe('new')
    locator.reset(null)
    locator.open()
    expect(locator.snapshot.open).toBe(false)
  })
  it('presents error and truncation and refreshes with a new catalog generation', async () => {
    let failed = true
    const { locator, bridge } = fixture(async (input) =>
      failed
        ? { ok: false, error: { code: 'SOURCE_CHANGED' } }
        : ({
            ...result(input),
            value: {
              ...(result(input) as { ok: true; value: LocatorResult }).value,
              catalogGeneration: 'fresh-generation',
              truncated: Boolean(input.query),
            },
          } as RawResult<LocatorResult>),
    )
    bridge.refreshSourceCatalog = vi.fn(async () => ({
      ok: true as const,
      value: { workspaceId, catalogGeneration: 'fresh-generation' },
    }))
    locator.open()
    await flush()
    expect(locator.snapshot.error?.code).toBe('SOURCE_CHANGED')
    failed = false
    locator.refresh()
    locator.setQuery('json')
    await flush()
    expect(locator.snapshot.catalogGeneration).toBe('fresh-generation')
    expect(locator.snapshot.truncated).toBe(true)
    expect(locator.snapshot.error).toBeNull()
    expect(bridge.refreshSourceCatalog).toHaveBeenCalled()
  })
})

it('selects through the real SourceSession lifecycle, preserves Explorer/Node state on cancel and activation failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'refatlas-locator-integration-')),
    service = new RawDataService()
  const call = async <T extends RawOutput>(
    kind: Parameters<typeof commandFromInput>[0],
    input: unknown,
  ): Promise<RawResult<T>> => {
    try {
      return {
        ok: true,
        value: (await service.execute(
          commandFromInput(kind, input)!,
          new AbortController().signal,
        )) as T,
      }
    } catch (error) {
      return { ok: false, error: { code: (error as { code: never }).code } }
    }
  }
  const bridge: RawBridge = {
    openWorkspace: async () => ({
      ok: true,
      value: (await service.execute(
        { kind: 'open', root },
        new AbortController().signal,
      )) as OpenResult,
    }),
    closeWorkspace: (input) => call('close', input),
    reloadSource: (input) => call('reload', input),
    listDirectory: (input) => call('directory', input),
    locateSources: (input) => call('locate', input),
    refreshSourceCatalog: (input) => call('catalog', input),
    getSourceInfo: (input) => call('info', input),
    readNode: (input) => call('read', input),
    listNodeChildren: (input) => call('children', input),
    readScalarSegment: (input) => call('segment', input),
    releaseSource: (input) => call('release', input),
    cancelRequest: async () => ({ ok: true, value: { accepted: false } }),
  }
  const workspace = new WorkspaceController(bridge)
  try {
    await writeFile(join(root, 'a.json'), '{"n":1.00}')
    await writeFile(join(root, 'b.json'), '{"n":2}')
    await writeFile(join(root, 'bad.json'), 'invalid')
    await workspace.open()
    await workspace.session.activate({
      workspaceId: workspace.snapshot.workspaceId!,
      relativePath: 'a.json' as never,
    })
    await new Promise((resolve) => setImmediate(resolve))
    const explorer = workspace.explorer.snapshot,
      active = workspace.session.snapshot.active,
      browser = workspace.browser.snapshot
    workspace.locator.open()
    workspace.locator.close()
    expect(workspace.explorer.snapshot).toBe(explorer)
    expect(workspace.session.snapshot.active).toBe(active)
    expect(workspace.browser.snapshot).toBe(browser)
    const settle = async () => {
      const deadline = performance.now() + 3000
      while (workspace.locator.snapshot.status !== 'ready') {
        if (performance.now() > deadline) throw Error('LOCATOR_NOT_READY')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }
    workspace.locator.open()
    workspace.locator.setQuery('bad')
    await settle()
    await workspace.locator.activate()
    expect(workspace.session.snapshot.active).toBe(active)
    expect(workspace.session.snapshot.error?.code).toBe('INVALID_JSON')
    expect(workspace.explorer.snapshot).toBe(explorer)
    workspace.locator.open()
    workspace.locator.setQuery('b.json')
    await settle()
    await workspace.locator.activate()
    expect(workspace.session.snapshot.active?.source.relativePath).toBe('b.json')
    expect(workspace.locator.snapshot.open).toBe(false)
    expect(workspace.session.snapshot.active?.root.kind).toBe('object')
    expect(workspace.explorer.snapshot).toBe(explorer)
  } finally {
    await workspace.dispose()
    service.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
