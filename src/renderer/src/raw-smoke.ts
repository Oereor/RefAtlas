import type {
  ChildrenResult,
  DirectoryPath,
  NodeAddress,
  NodeResult,
  RelativePath,
  SourceAddress,
  SourceInfo,
  WorkspaceId,
  RawResult,
} from '../../shared/raw'
import { byteSize, RAW_LIMITS } from '../../shared/raw'

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code)
}
function value<T>(result: RawResult<T> | import('../../shared/protocol').Result<T>): T {
  if (!result.ok) throw new Error(result.error.code)
  return result.value
}
let workspaceId: WorkspaceId,
  original: SourceInfo,
  current: SourceInfo,
  cached: NodeResult,
  page: ChildrenResult
const requestId = (): string => crypto.randomUUID()
const source = (file = 'sample.json'): SourceAddress => ({
  workspaceId,
  relativePath: file as RelativePath,
})
const address = (pointer = '', file = 'sample.json'): NodeAddress => ({
  source: source(file),
  pointer: pointer as NodeAddress['pointer'],
})
const info = async (file = 'sample.json'): Promise<SourceInfo> =>
  value(await window.raw.getSourceInfo({ requestId: requestId(), source: source(file) }))
export async function runRawSmoke(stage: string): Promise<unknown> {
  const bridge = window.raw
  if (stage === 'initial') {
    assert(
      Object.keys(bridge).sort().join(',') ===
        [
          'openWorkspace',
          'closeWorkspace',
          'getSourceInfo',
          'reloadSource',
          'listDirectory',
          'locateSources',
          'refreshSourceCatalog',
          'releaseSource',
          'readNode',
          'listNodeChildren',
          'readScalarSegment',
          'cancelRequest',
        ]
          .sort()
          .join(','),
      'RAW_BRIDGE_SURFACE',
    )
    const opened = value(await bridge.openWorkspace({ requestId: requestId() }))
    assert(opened.status === 'opened', 'WORKSPACE_OPEN')
    workspaceId = opened.workspaceId
    assert(opened.displayName === 'raw-fixtures', 'WORKSPACE_DISPLAY_NAME')
    const directoryInput = {
      requestId: requestId(),
      workspaceId,
      directory: '' as DirectoryPath,
      limit: 2,
      cursor: null,
    }
    const directoryPage = value(await bridge.listDirectory(directoryInput))
    assert(directoryPage.items.length === 2 && directoryPage.truncated, 'DIRECTORY_FIRST_PAGE')
    const directoryNext = value(
      await bridge.listDirectory({
        ...directoryInput,
        requestId: requestId(),
        cursor: directoryPage.nextCursor,
      }),
    )
    assert(
      directoryNext.items.length === 2 &&
        directoryNext.items[0].name !== directoryPage.items[0].name,
      'DIRECTORY_NEXT_PAGE',
    )
    const nested = value(
      await bridge.listDirectory({
        ...directoryInput,
        requestId: requestId(),
        directory: 'nested' as DirectoryPath,
      }),
    )
    assert(
      nested.items.length === 1 &&
        nested.items[0].kind === 'source' &&
        nested.items[0].name === 'child.json',
      'DIRECTORY_NESTED',
    )
    const directoryCancelId = requestId()
    const directoryPending = bridge.listDirectory({
      ...directoryInput,
      requestId: directoryCancelId,
      directory: 'directory-cancel' as DirectoryPath,
    })
    assert(
      value(await bridge.cancelRequest(directoryCancelId)).accepted,
      'DIRECTORY_CANCEL_ACCEPTED',
    )
    const directoryCancelled = await directoryPending
    assert(
      !directoryCancelled.ok && directoryCancelled.error.code === 'CANCELLED',
      'DIRECTORY_CANCELLED',
    )
    original = await info()
    for (const [pointer, lexeme] of [
      ['/n', '16752756560315677817'],
      ['/z', '-0'],
      ['/d', '1.00'],
    ]) {
      const result = value(
        await bridge.readNode({
          requestId: requestId(),
          address: address(pointer),
          expectedRevision: original.revision,
        }),
      )
      assert(
        result.mode === 'complete' &&
          result.value.kind === 'number' &&
          result.value.lexeme === lexeme,
        'LEXEME_LOSS',
      )
      if (pointer === '/n') cached = result
    }
    const string = value(
      await bridge.readNode({
        requestId: requestId(),
        address: address('/s'),
        expectedRevision: original.revision,
      }),
    )
    assert(
      string.mode === 'complete' &&
        string.value.kind === 'string' &&
        string.value.value === '16752756560315677817',
      'STRING_KIND_LOSS',
    )
    const unicode = value(
      await bridge.readNode({
        requestId: requestId(),
        address: address('/a~0b~1c'),
        expectedRevision: original.revision,
      }),
    )
    assert(
      unicode.mode === 'complete' &&
        unicode.value.kind === 'string' &&
        unicode.value.value === '中文🙂\uD800',
      'UNICODE_LOSS',
    )
    const repeated = value(
      await bridge.readNode({
        requestId: requestId(),
        address: address('/n'),
        expectedRevision: original.revision,
      }),
    )
    assert(JSON.stringify(repeated) === JSON.stringify(cached), 'RANGE_INCONSISTENCY')
    const large = value(
      await bridge.readNode({
        requestId: requestId(),
        address: address('/entries'),
        expectedRevision: original.revision,
      }),
    )
    assert(large.mode === 'summary' && byteSize(large) < RAW_LIMITS.responseBytes, 'UNBOUNDED_NODE')
    page = value(
      await bridge.listNodeChildren({
        requestId: requestId(),
        address: address('/entries'),
        expectedRevision: original.revision,
        limit: 3,
        cursor: null,
      }),
    )
    const second = value(
      await bridge.listNodeChildren({
        requestId: requestId(),
        address: address('/entries'),
        expectedRevision: original.revision,
        limit: 3,
        cursor: page.nextCursor,
      }),
    )
    assert(second.items[0].ordinal === 3, 'PAGINATION')
    const segment = value(
      await bridge.readScalarSegment({
        requestId: requestId(),
        address: address('/long'),
        expectedRevision: original.revision,
        limit: 4096,
        cursor: null,
      }),
    )
    assert(
      segment.truncated &&
        [...segment.text].length === 4096 &&
        !/[\uD800-\uDBFF]$/.test(segment.text),
      'SCALAR_SEGMENT',
    )
    for (const [file, code] of [
      ['huge.json', 'RESOURCE_LIMIT'],
      ['bad.json', 'INVALID_JSON'],
    ]) {
      const metadata = await info(file)
      const result = await bridge.readNode({
        requestId: requestId(),
        address: address('', file),
        expectedRevision: metadata.revision,
      })
      assert(!result.ok && result.error.code === code, 'RAW_FAILURE_CODE')
    }
    const cancelSource = await info('cancel.json'),
      id = requestId()
    const pending = bridge.readNode({
      requestId: id,
      address: address('', 'cancel.json'),
      expectedRevision: cancelSource.revision,
    })
    await new Promise((resolve) => setTimeout(resolve, 15))
    const begin = performance.now()
    assert(value(await bridge.cancelRequest(id)).accepted, 'RAW_CANCEL_ACCEPTED')
    const cancelled = await pending
    assert(!cancelled.ok && cancelled.error.code === 'CANCELLED', 'RAW_CANCELLED')
    const escaped = await bridge.getSourceInfo({
      requestId: requestId(),
      source: { workspaceId, relativePath: '../secret.json' as RelativePath },
    })
    assert(!escaped.ok && escaped.error.code === 'INVALID_INPUT', 'PATH_ESCAPE')
    const operationOverride = await bridge.getSourceInfo({
      requestId: requestId(),
      kind: 'open',
      root: 'C:/Windows',
    } as never)
    assert(
      !operationOverride.ok && operationOverride.error.code === 'INVALID_INPUT',
      'OPERATION_OVERRIDE',
    )
    assert(
      value(await bridge.releaseSource({ requestId: requestId(), source: source() })).released,
      'SOURCE_RELEASE',
    )
    const releasedRead = await bridge.readNode({
      requestId: requestId(),
      address: address(),
      expectedRevision: original.revision,
    })
    assert(!releasedRead.ok && releasedRead.error.code === 'SOURCE_CHANGED', 'RELEASED_READ')
    assert(
      !value(await bridge.releaseSource({ requestId: requestId(), source: source() })).released,
      'SOURCE_RELEASE_REPEAT',
    )
    const oldRevision = original.revision
    original = await info()
    assert(original.revision !== oldRevision, 'SOURCE_REACQUIRE')
    value(
      await bridge.readNode({
        requestId: requestId(),
        address: address(),
        expectedRevision: original.revision,
      }),
    )
    value(
      await bridge.listDirectory({
        ...directoryInput,
        requestId: requestId(),
        cursor: directoryPage.nextCursor,
      }),
    )
    return {
      stage,
      checks: [
        'lexemes',
        'raw-types',
        'unicode-surrogate',
        'range',
        'summary',
        'pages',
        'segments',
        'scalar-limit',
        'invalid-json',
        'cancellation',
        'path',
        'display-name',
        'directory-pages',
        'directory-nested',
        'directory-cancel',
        'release',
        'released-read',
        'reacquire',
      ],
      cancelMs: performance.now() - begin,
      responseBytes: byteSize(large),
    }
  }
  if (stage === 'changed') {
    const old = await bridge.readNode({
      requestId: requestId(),
      address: address('/n'),
      expectedRevision: original.revision,
    })
    assert(!old.ok && old.error.code === 'SOURCE_CHANGED', 'OLD_REVISION')
    assert((await info()).state === 'stale', 'STALE_STATE')
    current = value(await bridge.reloadSource({ requestId: requestId(), source: source() }))
    assert(current.revision !== original.revision, 'NEW_REVISION')
    const stale = await bridge.listNodeChildren({
      requestId: requestId(),
      address: address('/entries'),
      expectedRevision: current.revision,
      limit: 3,
      cursor: page.nextCursor,
    })
    assert(!stale.ok && stale.error.code === 'STALE_CURSOR', 'STALE_CURSOR')
    const fresh = value(
      await bridge.readNode({
        requestId: requestId(),
        address: address('/n'),
        expectedRevision: current.revision,
      }),
    )
    assert(
      fresh.mode === 'complete' && fresh.value.kind === 'number' && fresh.value.lexeme === '2',
      'RELOAD_VALUE',
    )
    return { stage, checks: ['stale-revision', 'range-invalidated', 'stale-cursor', 'reload'] }
  }
  if (stage === 'deleted') {
    const deleted = await bridge.readNode({
      requestId: requestId(),
      address: address('/n'),
      expectedRevision: current.revision,
    })
    assert(!deleted.ok && deleted.error.code === 'SOURCE_CHANGED', 'DELETED_SOURCE')
    const missing = await bridge.getSourceInfo({
      requestId: requestId(),
      source: source('missing.json'),
    })
    assert(!missing.ok && missing.error.code === 'NOT_FOUND', 'MISSING_SOURCE')
    return { stage, checks: ['deleted', 'missing'] }
  }
  value(await window.foundation.crashDataServiceForTest())
  const unavailable = await bridge.getSourceInfo({ requestId: requestId(), source: source() })
  assert(!unavailable.ok && unavailable.error.code === 'SERVICE_UNAVAILABLE', 'SERVICE_UNAVAILABLE')
  value(await window.foundation.restartDataServiceForTest())
  const obsolete = await bridge.getSourceInfo({ requestId: requestId(), source: source() })
  assert(!obsolete.ok && obsolete.error.code === 'WORKSPACE_NOT_OPEN', 'RESTART_STATE')
  const reopened = value(await bridge.openWorkspace({ requestId: requestId() }))
  assert(reopened.status === 'opened' && reopened.workspaceId !== workspaceId, 'WORKSPACE_REOPEN')
  value(await bridge.closeWorkspace({ requestId: requestId(), workspaceId: reopened.workspaceId }))
  return { stage, checks: ['service-exit', 'restart', 'workspace-generation', 'close'] }
}
