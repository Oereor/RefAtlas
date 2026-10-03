import { describe, expect, it } from 'vitest'
import { ExplorerController } from '../src/renderer/src/explorer/explorer-controller'
import { WorkspaceController } from '../src/renderer/src/state/workspace-controller'
import type {
  DirectoryEntry,
  DirectoryInput,
  DirectoryPath,
  DirectoryResult,
  RawBridge,
  RawResult,
  WorkspaceId,
} from '../src/shared/raw'

const workspaceId = crypto.randomUUID() as WorkspaceId
const path = (value: string) => value as DirectoryPath
const folder = (name: string): DirectoryEntry => ({ kind: 'directory', name, path: path(name) })
const page = (
  input: DirectoryInput,
  items: DirectoryEntry[],
  nextCursor: string | null = null,
): RawResult<DirectoryResult> => ({
  ok: true,
  value: {
    workspaceId: input.workspaceId,
    directory: input.directory,
    items,
    nextCursor,
    truncated: nextCursor !== null,
  },
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function bridge(listDirectory: RawBridge['listDirectory']): RawBridge {
  const api: Partial<RawBridge> = {
    listDirectory,
    cancelRequest: async () => ({ ok: true, value: { accepted: true } }),
  }
  return api as RawBridge
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('Explorer observable lifecycle', () => {
  it('loads lazily and preserves empty ready directories when reopened', async () => {
    const listed: string[] = []
    const explorer = new ExplorerController(
      bridge(async (input) => {
        listed.push(input.directory)
        return page(input, input.directory ? [] : [folder('empty')])
      }),
    )
    await explorer.open(workspaceId)
    expect(listed).toEqual([''])
    await explorer.expand(path('empty'), explorer.snapshot.directories.get(path(''))!.entries[0].id)
    expect(explorer.snapshot.directories.get(path('empty'))!.status).toBe('ready')
    explorer.collapse(path('empty'))
    await explorer.expand(path('empty'))
    expect(listed).toEqual(['', 'empty'])
  })
  it('collapse cancels transport; obsolete success and finally cannot overwrite a re-expansion', async () => {
    const first = deferred<RawResult<DirectoryResult>>(),
      second = deferred<RawResult<DirectoryResult>>()
    const inputs: DirectoryInput[] = [],
      cancelled: string[] = []
    const api = bridge(async (input) => {
      if (!input.directory) return page(input, [folder('a')])
      inputs.push(input)
      return inputs.length === 1 ? first.promise : second.promise
    })
    api.cancelRequest = async (id) => {
      cancelled.push(id)
      return { ok: true, value: { accepted: true } }
    }
    const explorer = new ExplorerController(api)
    await explorer.open(workspaceId)
    const old = explorer.expand(path('a'))
    await flush()
    explorer.collapse(path('a'))
    const fresh = explorer.expand(path('a'))
    await flush()
    expect(cancelled).toEqual([inputs[0].requestId])
    first.resolve(page(inputs[0], [folder('late')]))
    await old
    expect(explorer.snapshot.directories.get(path('a'))!.status).toBe('loading')
    expect(explorer.snapshot.directories.get(path('a'))!.requestId).toBe(inputs[1].requestId)
    second.resolve(page(inputs[1], []))
    await fresh
    expect(explorer.snapshot.directories.get(path('a'))!.entries).toEqual([])
  })
  it('retries initial/next-page failures and appends stable IDs without losing selection/focus', async () => {
    let failInitial = true,
      failNext = true
    const cursor = crypto.randomUUID()
    const explorer = new ExplorerController(
      bridge(async (input) => {
        if (failInitial) {
          failInitial = false
          return { ok: false, error: { code: 'ACCESS_DENIED' } }
        }
        if (input.cursor && failNext) {
          failNext = false
          return { ok: false, error: { code: 'TIMEOUT' } }
        }
        return page(input, [folder(input.cursor ? 'b' : 'a')], input.cursor ? null : cursor)
      }),
    )
    await explorer.open(workspaceId)
    expect(explorer.snapshot.directories.get(path(''))!.status).toBe('error')
    await explorer.retry(path(''))
    const entry = explorer.snapshot.directories.get(path(''))!.entries[0]
    explorer.select(entry.id)
    explorer.focus(entry.id)
    await explorer.more(path(''))
    expect(explorer.snapshot.directories.get(path(''))!.status).toBe('ready')
    expect(explorer.snapshot.directories.get(path(''))!.error?.code).toBe('TIMEOUT')
    await explorer.more(path(''))
    expect(explorer.snapshot.directories.get(path(''))!.entries[0]).toBe(entry)
    expect(explorer.snapshot.selectedId).toBe(entry.id)
    expect(explorer.snapshot.focusedId).toBe(entry.id)
    expect(
      explorer.snapshot.directories.get(path(''))!.entries.map((item) => item.entry.name),
    ).toEqual(['a', 'b'])
  })
  it('stale cursor retains the stream until explicit refresh from null', async () => {
    const inputs: DirectoryInput[] = []
    const explorer = new ExplorerController(
      bridge(async (input) => {
        inputs.push(input)
        return input.cursor
          ? { ok: false, error: { code: 'STALE_CURSOR' } }
          : page(input, [folder('a')], crypto.randomUUID())
      }),
    )
    await explorer.open(workspaceId)
    const entry = explorer.snapshot.directories.get(path(''))!.entries[0]
    await explorer.more(path(''))
    await explorer.more(path(''), true)
    expect(explorer.snapshot.directories.get(path(''))!.entries[0]).toBe(entry)
    expect(explorer.tree().children!.at(-1)!.action).toBe('refresh')
    expect(inputs).toHaveLength(2)
    await explorer.refresh()
    expect(inputs.at(-1)!.cursor).toBe(null)
  })
  it('bounds concurrency, cancels queued branches, and discards old workspace completions', async () => {
    const pending: {
      input: DirectoryInput
      gate: ReturnType<typeof deferred<RawResult<DirectoryResult>>>
    }[] = []
    const explorer = new ExplorerController(
      bridge(async (input) => {
        if (!input.directory) return page(input, [folder('a'), folder('b'), folder('c')])
        const gate = deferred<RawResult<DirectoryResult>>()
        pending.push({ input, gate })
        return gate.promise
      }),
    )
    await explorer.open(workspaceId)
    const tasks = ['a', 'b', 'c'].map((item) => explorer.expand(path(item)))
    await flush()
    expect(pending).toHaveLength(2)
    explorer.collapse(path('c'))
    await tasks[2]
    const next = crypto.randomUUID() as WorkspaceId
    const opening = explorer.open(next)
    for (const task of pending) task.gate.resolve(page(task.input, [folder('late')]))
    await Promise.all([...tasks, opening])
    expect(explorer.snapshot.workspaceId).toBe(next)
    expect(explorer.snapshot.directories.size).toBe(1)
  })
  it('evicts collapsed LRU pages and rejects growth when protected pages fill the budget', async () => {
    const api = bridge(async (input) =>
      page(
        input,
        !input.directory
          ? [folder('a'), folder('b')]
          : [folder(input.directory + '/one'), folder(input.directory + '/two')],
      ),
    )
    const explorer = new ExplorerController(api, { entries: 4, bytes: 10000 })
    await explorer.open(workspaceId)
    await explorer.expand(path('a'))
    explorer.collapse(path('a'))
    await explorer.expand(path('b'))
    expect(explorer.snapshot.directories.has(path('a'))).toBe(false)
    expect(explorer.cacheUsage.entries).toBe(4)
    await explorer.expand(path('a'))
    expect(explorer.snapshot.directories.get(path('a'))!.error?.details?.limit).toBe(
      'EXPLORER_CACHE',
    )
    expect(explorer.snapshot.directories.get(path('b'))!.entries).toHaveLength(2)
  })
  it('protects selected ancestry under byte pressure, and refresh clears descendant selection/focus', async () => {
    const api = bridge(async (input) =>
      page(
        input,
        !input.directory
          ? [folder('a'), folder('b')]
          : input.directory === 'a'
            ? [{ kind: 'directory', name: 'nested', path: path('a/nested') }]
            : [
                {
                  kind: 'source',
                  name: 'child.json',
                  source: {
                    workspaceId,
                    relativePath: (input.directory +
                      '/child.json') as import('../src/shared/raw').RelativePath,
                  },
                },
              ],
      ),
    )
    const explorer = new ExplorerController(api, { entries: 4, bytes: 10000 })
    await explorer.open(workspaceId)
    const a = explorer.snapshot.directories.get(path(''))!.entries[0]
    await explorer.expand(path('a'), a.id)
    const nested = explorer.snapshot.directories.get(path('a'))!.entries[0]
    await explorer.expand(path('a/nested'), nested.id)
    const child = explorer.snapshot.directories.get(path('a/nested'))!.entries[0]
    explorer.select(child.id)
    explorer.focus(child.id)
    explorer.collapse(path('a'))
    await explorer.expand(path('b'))
    expect(explorer.snapshot.directories.get(path('a/nested'))!.entries[0]).toBe(child)
    expect(explorer.snapshot.directories.get(path('b'))!.error?.code).toBe('RESOURCE_LIMIT')
    await explorer.refresh(path('a'))
    expect(explorer.snapshot.selectedId).toBe(null)
    expect(explorer.snapshot.focusedId).toBe(a.id)
  })
  it('enforces serialized metadata independently from the entry count budget', async () => {
    const explorer = new ExplorerController(
      bridge(async (input) => page(input, [folder('长'.repeat(100))])),
      { entries: 10000, bytes: 500 },
    )
    await explorer.open(workspaceId)
    expect(explorer.snapshot.directories.get(path(''))!.error?.details?.limit).toBe(
      'EXPLORER_CACHE',
    )
    expect(explorer.cacheUsage.entries).toBe(0)
  })
  it('bounds auxiliary directory state even when empty directories add no entries', async () => {
    const limits = { entries: 10000, bytes: 10000 }
    const explorer = new ExplorerController(
      bridge(async (input) => page(input, input.directory ? [] : [folder('a'), folder('b')])),
      limits,
    )
    await explorer.open(workspaceId)
    await explorer.expand(path('a'))
    const before = explorer.cacheUsage
    limits.bytes = before.bytes + 8
    expect(explorer.snapshot.directories.get(path('a'))?.status).toBe('ready')
    await explorer.expand(path('b'))
    expect(explorer.snapshot.cacheLimited).toBe(true)
    expect(explorer.snapshot.directories.has(path('b'))).toBe(false)
    expect(explorer.cacheUsage).toEqual(before)
    expect(explorer.tree().children!.at(-1)!.error?.code).toBe('RESOURCE_LIMIT')
    explorer.collapse(path('a'))
    await explorer.expand(path('b'))
    expect(explorer.snapshot.cacheLimited).toBe(false)
    expect(explorer.cacheUsage.bytes).toBeLessThanOrEqual(limits.bytes)
  })
})

describe('Workspace UI state', () => {
  it('restores initial/existing state on picker cancel and resets after successful switch', async () => {
    let result: Awaited<ReturnType<RawBridge['openWorkspace']>> = {
      ok: true,
      value: { status: 'cancelled' },
    }
    const api = bridge(async (input) => page(input, [folder('a')]))
    api.openWorkspace = async () => result
    const workspace = new WorkspaceController(api)
    await workspace.open()
    expect(workspace.snapshot.status).toBe('closed')
    result = { ok: true, value: { status: 'opened', workspaceId, displayName: 'fixture' } }
    await workspace.open()
    const before = workspace.explorer.snapshot.directories
    result = { ok: true, value: { status: 'cancelled' } }
    await workspace.open()
    expect(workspace.snapshot.workspaceId).toBe(workspaceId)
    expect(workspace.explorer.snapshot.directories).toBe(before)
    result = {
      ok: true,
      value: {
        status: 'opened',
        workspaceId: crypto.randomUUID() as WorkspaceId,
        displayName: 'new',
      },
    }
    await workspace.open()
    expect(workspace.explorer.snapshot.directories).not.toBe(before)
    expect(workspace.snapshot.displayName).toBe('new')
  })
  it('blocks duplicate pickers and clears invalid prior session on open failure', async () => {
    const gate = deferred<Awaited<ReturnType<RawBridge['openWorkspace']>>>()
    let calls = 0
    const api = bridge(async (input) => page(input, []))
    api.openWorkspace = () => {
      calls++
      return gate.promise
    }
    const workspace = new WorkspaceController(api)
    const opening = workspace.open()
    await workspace.open()
    expect(calls).toBe(1)
    expect(workspace.snapshot.status).toBe('opening')
    gate.resolve({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } })
    await opening
    expect(workspace.snapshot.status).toBe('error')
    expect(workspace.explorer.snapshot.workspaceId).toBe(null)
  })
})
