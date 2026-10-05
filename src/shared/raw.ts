import { exact, object, validId } from './protocol'

declare const identity: unique symbol
export type WorkspaceId = string & { readonly [identity]: 'workspace' }
export type RelativePath = string & { readonly [identity]: 'relative-path' }
export type DirectoryPath = string & { readonly [identity]: 'directory-path' }
export type JsonPointer = string & { readonly [identity]: 'json-pointer' }
export type SourceRevision = string & { readonly [identity]: 'revision' }
export type SourceAddress = { workspaceId: WorkspaceId; relativePath: RelativePath }
export type NodeAddress = { source: SourceAddress; pointer: JsonPointer }
export type SourceRange = { startByte: number; endByteExclusive: number }
export type RawScalar =
  | { kind: 'null' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'number'; lexeme: string }
  | { kind: 'string'; value: string }
export type RawValue =
  | RawScalar
  | { kind: 'array'; items: RawValue[] }
  | {
      kind: 'object'
      entries: { key: string; value: RawValue }[]
    }
export type RawKind = RawValue['kind']
export const RAW_LIMITS = Object.freeze({
  requestBytes: 16 * 1024,
  responseBytes: 64 * 1024,
  valueBytes: 48 * 1024,
  valueNodes: 1000,
  valueDepth: 8,
  page: 100,
  segment: 4096,
  readBytes: 128 * 1024 * 1024,
  tokens: 8_000_000,
  depth: 128,
  tokenBytes: 256 * 1024,
  chunkBytes: 4096,
  workMs: 15000,
  sources: 256,
  cacheBytes: 8 * 1024 * 1024,
  cursors: 256,
  keys: 524288,
  keyBytes: 16 * 1024 * 1024,
  addressBytes: 4096,
})
export const RAW_CHANNELS = Object.freeze({
  open: 'raw:open',
  close: 'raw:close',
  info: 'raw:info',
  reload: 'raw:reload',
  read: 'raw:read',
  children: 'raw:children',
  segment: 'raw:segment',
  cancel: 'raw:cancel',
  directory: 'raw:directory',
  release: 'raw:release',
  locate: 'raw:locate',
  catalog: 'raw:catalog',
})
export const LOCATOR_LIMITS = Object.freeze({
  page: 50,
  sources: 1_000_000,
  directories: 100_000,
  entries: 2_000_000,
  bytes: 128 * 1024 * 1024,
  buildMs: 60_000,
  queryMs: 1000,
  yieldEvery: 64,
  queryYieldEvery: 1024,
})
export type LocatorItem = { name: string; source: SourceAddress }
export type LocatorInput = RequestIdInput & {
  workspaceId: WorkspaceId
  query: string
  limit: number
  catalogGeneration: string | null
}
export type CatalogResult = { workspaceId: WorkspaceId; catalogGeneration: string }
export type LocatorResult = CatalogResult & {
  query: string
  status: 'building' | 'ready'
  items: LocatorItem[]
  truncated: boolean
}
export function sourceMatchRank(path: string, name: string, query: string): number {
  if (!query) return 4
  const key = query.toLowerCase(),
    base = name.toLowerCase()
  return base === key
    ? 0
    : base.startsWith(key)
      ? 1
      : base.includes(key)
        ? 2
        : path.toLowerCase().includes(key)
          ? 3
          : 4
}
export function compareLocatorItems(left: LocatorItem, right: LocatorItem, query: string): number {
  const rank =
    sourceMatchRank(left.source.relativePath, left.name, query) -
    sourceMatchRank(right.source.relativePath, right.name, query)
  return (
    rank ||
    (left.source.relativePath < right.source.relativePath
      ? -1
      : left.source.relativePath > right.source.relativePath
        ? 1
        : 0)
  )
}
export const DIRECTORY_LIMITS = Object.freeze({
  page: 200,
  scan: 20_000,
  snapshotBytes: 4 * 1024 * 1024,
  cacheBytes: 8 * 1024 * 1024,
  snapshots: 32,
  cursors: 256,
  ttlMs: 60_000,
  workMs: 5000,
  concurrency: 2,
  yieldEvery: 64,
})
export type RawCode =
  | 'INVALID_INPUT'
  | 'BUSY'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'SERVICE_EXIT'
  | 'SERVICE_UNAVAILABLE'
  | 'PROTOCOL_ERROR'
  | 'INTERNAL'
  | 'WORKSPACE_NOT_OPEN'
  | 'NOT_FOUND'
  | 'SOURCE_CHANGED'
  | 'STALE_CURSOR'
  | 'INVALID_JSON'
  | 'AMBIGUOUS_OBJECT_KEY'
  | 'RESOURCE_LIMIT'
  | 'PARSER_FAILURE'
  | 'ACCESS_DENIED'
const codes: RawCode[] = [
  'INVALID_INPUT',
  'BUSY',
  'CANCELLED',
  'TIMEOUT',
  'SERVICE_EXIT',
  'SERVICE_UNAVAILABLE',
  'PROTOCOL_ERROR',
  'INTERNAL',
  'WORKSPACE_NOT_OPEN',
  'NOT_FOUND',
  'SOURCE_CHANGED',
  'STALE_CURSOR',
  'INVALID_JSON',
  'AMBIGUOUS_OBJECT_KEY',
  'RESOURCE_LIMIT',
  'PARSER_FAILURE',
  'ACCESS_DENIED',
]
export type RawResult<T> =
  { ok: true; value: T } | { ok: false; error: { code: RawCode; details?: { limit: string } } }
export class RawError extends Error {
  constructor(
    public readonly code: RawCode,
    public readonly details?: { limit: string },
  ) {
    super(code)
  }
}
export function rawFailure(code: RawCode, details?: { limit: string }): RawResult<never> {
  return { ok: false, error: details ? { code, details } : { code } }
}
export function byteSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Infinity
  }
}
export function rawBounded(value: unknown, bytes = RAW_LIMITS.responseBytes): boolean {
  return byteSize(value) <= bytes
}
export function validPath(value: unknown): value is RelativePath {
  return (
    typeof value === 'string' &&
    byteSize(value) <= RAW_LIMITS.addressBytes &&
    !/[\\:\x00]/.test(value) &&
    value.endsWith('.json') &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  )
}
export function validDirectoryPath(value: unknown): value is DirectoryPath {
  return (
    typeof value === 'string' &&
    byteSize(value) <= RAW_LIMITS.addressBytes &&
    (value === '' ||
      (!/[\\:\x00]/.test(value) &&
        value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')))
  )
}
export function validPointer(value: unknown): value is JsonPointer {
  return (
    typeof value === 'string' &&
    byteSize(value) <= RAW_LIMITS.addressBytes &&
    (value === '' || value.startsWith('/')) &&
    !/~(?:[^01]|$)/.test(value)
  )
}
export function validSource(value: unknown): value is SourceAddress {
  return (
    object(value) &&
    exact(value, ['workspaceId', 'relativePath']) &&
    validId(value.workspaceId) &&
    validPath(value.relativePath)
  )
}
export function validAddress(value: unknown): value is NodeAddress {
  return (
    object(value) &&
    exact(value, ['source', 'pointer']) &&
    validSource(value.source) &&
    validPointer(value.pointer)
  )
}
export function escapePointer(key: string | number): string {
  return String(key).replaceAll('~', '~0').replaceAll('/', '~1')
}
export function splitPointer(pointer: string): string[] {
  if (!validPointer(pointer)) throw new RawError('INVALID_INPUT')
  return pointer === ''
    ? []
    : pointer
        .slice(1)
        .split('/')
        .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
}
export function joinPointer(tokens: readonly string[]): JsonPointer {
  if (!Array.isArray(tokens) || ![...tokens].every((token) => typeof token === 'string'))
    throw new RawError('INVALID_INPUT')
  const pointer = tokens.length ? '/' + tokens.map(escapePointer).join('/') : ''
  if (!validPointer(pointer)) throw new RawError('INVALID_INPUT')
  return pointer
}
export function parentPointer(pointer: string): JsonPointer | null {
  const tokens = splitPointer(pointer)
  return tokens.length ? joinPointer(tokens.slice(0, -1)) : null
}
export type DirectoryEntry =
  | { kind: 'directory'; name: string; path: DirectoryPath }
  | { kind: 'source'; name: string; source: SourceAddress }
export type DirectoryInput = RequestIdInput & {
  workspaceId: WorkspaceId
  directory: DirectoryPath
  limit: number
  cursor: string | null
}
export type DirectoryResult = {
  workspaceId: WorkspaceId
  directory: DirectoryPath
  items: DirectoryEntry[]
  nextCursor: string | null
  truncated: boolean
}
export function compareDirectoryEntries(left: DirectoryEntry, right: DirectoryEntry): number {
  if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
}
export function sameSource(left: SourceAddress, right: SourceAddress): boolean {
  return left.workspaceId === right.workspaceId && left.relativePath === right.relativePath
}
export function sameAddress(left: NodeAddress, right: NodeAddress): boolean {
  return sameSource(left.source, right.source) && left.pointer === right.pointer
}
export type RequestIdInput = { requestId: string }
export type SourceInput = RequestIdInput & { source: SourceAddress }
export type NodeInput = RequestIdInput & { address: NodeAddress; expectedRevision: SourceRevision }
export type PageInput = NodeInput & { limit: number; cursor: string | null }
export type RawCommand =
  | { kind: 'open'; root: string }
  | { kind: 'close'; workspaceId: WorkspaceId }
  | { kind: 'info'; source: SourceAddress }
  | { kind: 'reload'; source: SourceAddress }
  | { kind: 'release'; source: SourceAddress }
  | { kind: 'catalog'; workspaceId: WorkspaceId }
  | {
      kind: 'locate'
      workspaceId: WorkspaceId
      query: string
      limit: number
      catalogGeneration: string | null
    }
  | {
      kind: 'directory'
      workspaceId: WorkspaceId
      directory: DirectoryPath
      limit: number
      cursor: string | null
    }
  | { kind: 'read'; address: NodeAddress; expectedRevision: SourceRevision }
  | {
      kind: 'children' | 'segment'
      address: NodeAddress
      expectedRevision: SourceRevision
      limit: number
      cursor: string | null
    }
export type SourceInfo = {
  source: SourceAddress
  revision: SourceRevision
  state: 'current' | 'stale'
  sizeBytes: number
  validated: boolean
}
export type NodeSummary = {
  address: NodeAddress
  revision: SourceRevision
  kind: RawKind
  range: SourceRange | null
  childCount: number | null
  preview: string | null
  truncated: boolean
}
export type NodeResult =
  { mode: 'complete'; node: NodeSummary; value: RawValue } | { mode: 'summary'; node: NodeSummary }
export type ChildrenResult = {
  address: NodeAddress
  revision: SourceRevision
  items: { ordinal: number; key: string | number; node: NodeSummary }[]
  nextCursor: string | null
  truncated: boolean
}
export type SegmentResult = {
  address: NodeAddress
  revision: SourceRevision
  kind: 'number' | 'string'
  text: string
  nextCursor: string | null
  truncated: boolean
}
export type OpenResult =
  { status: 'opened'; workspaceId: WorkspaceId; displayName: string } | { status: 'cancelled' }
export type RawOutput =
  | OpenResult
  | { closed: true }
  | SourceInfo
  | NodeResult
  | ChildrenResult
  | SegmentResult
  | DirectoryResult
  | LocatorResult
  | CatalogResult
  | { released: boolean }
export interface RawBridge {
  openWorkspace(input: RequestIdInput): Promise<RawResult<OpenResult>>
  closeWorkspace(
    input: RequestIdInput & { workspaceId: WorkspaceId },
  ): Promise<RawResult<{ closed: true }>>
  getSourceInfo(input: SourceInput): Promise<RawResult<SourceInfo>>
  reloadSource(input: SourceInput): Promise<RawResult<SourceInfo>>
  listDirectory(input: DirectoryInput): Promise<RawResult<DirectoryResult>>
  locateSources(input: LocatorInput): Promise<RawResult<LocatorResult>>
  refreshSourceCatalog(
    input: RequestIdInput & { workspaceId: WorkspaceId },
  ): Promise<RawResult<CatalogResult>>
  releaseSource(input: SourceInput): Promise<RawResult<{ released: boolean }>>
  readNode(input: NodeInput): Promise<RawResult<NodeResult>>
  listNodeChildren(input: PageInput): Promise<RawResult<ChildrenResult>>
  readScalarSegment(input: PageInput): Promise<RawResult<SegmentResult>>
  cancelRequest(requestId: string): Promise<RawResult<{ accepted: boolean }>>
}
export function validCommand(value: unknown): value is RawCommand {
  if (!object(value) || !rawBounded(value, RAW_LIMITS.requestBytes)) return false
  if (value.kind === 'open')
    return (
      exact(value, ['kind', 'root']) &&
      typeof value.root === 'string' &&
      value.root.length > 0 &&
      !value.root.includes('\0')
    )
  if (value.kind === 'close')
    return exact(value, ['kind', 'workspaceId']) && validId(value.workspaceId)
  if (value.kind === 'catalog')
    return exact(value, ['kind', 'workspaceId']) && validId(value.workspaceId)
  if (value.kind === 'locate')
    return (
      exact(value, ['kind', 'workspaceId', 'query', 'limit', 'catalogGeneration']) &&
      validId(value.workspaceId) &&
      typeof value.query === 'string' &&
      Number.isInteger(value.limit) &&
      Number(value.limit) >= 1 &&
      Number(value.limit) <= LOCATOR_LIMITS.page &&
      cursor(value.catalogGeneration)
    )
  if (value.kind === 'info' || value.kind === 'reload' || value.kind === 'release')
    return exact(value, ['kind', 'source']) && validSource(value.source)
  if (value.kind === 'directory')
    return (
      exact(value, ['kind', 'workspaceId', 'directory', 'limit', 'cursor']) &&
      validId(value.workspaceId) &&
      validDirectoryPath(value.directory) &&
      Number.isInteger(value.limit) &&
      Number(value.limit) >= 1 &&
      Number(value.limit) <= DIRECTORY_LIMITS.page &&
      cursor(value.cursor)
    )
  if (value.kind !== 'read' && value.kind !== 'children' && value.kind !== 'segment') return false
  if (!validAddress(value.address) || !validId(value.expectedRevision)) return false
  if (value.kind === 'read') return exact(value, ['kind', 'address', 'expectedRevision'])
  return (
    exact(value, ['kind', 'address', 'expectedRevision', 'limit', 'cursor']) &&
    Number.isInteger(value.limit) &&
    Number(value.limit) >= 1 &&
    Number(value.limit) <= (value.kind === 'children' ? RAW_LIMITS.page : RAW_LIMITS.segment) &&
    (value.cursor === null || validId(value.cursor))
  )
}
export function commandFromInput(
  kind: Exclude<RawCommand['kind'], 'open'>,
  input: unknown,
): RawCommand | null {
  if (
    !object(input) ||
    Object.hasOwn(input, 'kind') ||
    !validId(input.requestId) ||
    !rawBounded(input, RAW_LIMITS.requestBytes)
  )
    return null
  const { requestId: _id, ...rest } = input
  const command = { ...rest, kind }
  return validCommand(command) ? command : null
}
function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}
function cursor(value: unknown): boolean {
  return value === null || validId(value)
}
function validRange(value: unknown): boolean {
  return (
    value === null ||
    (object(value) &&
      exact(value, ['startByte', 'endByteExclusive']) &&
      integer(value.startByte) &&
      integer(value.endByteExclusive) &&
      value.endByteExclusive > value.startByte)
  )
}
function validSummary(value: unknown): value is NodeSummary {
  return (
    object(value) &&
    exact(value, ['address', 'revision', 'kind', 'range', 'childCount', 'preview', 'truncated']) &&
    validAddress(value.address) &&
    validId(value.revision) &&
    typeof value.kind === 'string' &&
    ['null', 'boolean', 'number', 'string', 'array', 'object'].includes(value.kind) &&
    validRange(value.range) &&
    (value.childCount === null || integer(value.childCount)) &&
    (value.preview === null ||
      (typeof value.preview === 'string' && value.preview.length <= 512)) &&
    typeof value.truncated === 'boolean'
  )
}
function validValue(value: unknown, depth = 0, counter = { nodes: 0 }): value is RawValue {
  if (!object(value) || ++counter.nodes > RAW_LIMITS.valueNodes || depth > RAW_LIMITS.valueDepth)
    return false
  switch (value.kind) {
    case 'null':
      return exact(value, ['kind'])
    case 'boolean':
      return exact(value, ['kind', 'value']) && typeof value.value === 'boolean'
    case 'string':
      return exact(value, ['kind', 'value']) && typeof value.value === 'string'
    case 'number':
      return (
        exact(value, ['kind', 'lexeme']) &&
        typeof value.lexeme === 'string' &&
        /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value.lexeme)
      )
    case 'array':
      return (
        exact(value, ['kind', 'items']) &&
        Array.isArray(value.items) &&
        value.items.length <= RAW_LIMITS.valueNodes &&
        value.items.every((item) => validValue(item, depth + 1, counter))
      )
    case 'object': {
      if (
        !exact(value, ['kind', 'entries']) ||
        !Array.isArray(value.entries) ||
        value.entries.length > RAW_LIMITS.valueNodes
      )
        return false
      const keys = new Set<string>()
      return value.entries.every((entry) => {
        if (
          !object(entry) ||
          !exact(entry, ['key', 'value']) ||
          typeof entry.key !== 'string' ||
          keys.has(entry.key)
        )
          return false
        keys.add(entry.key)
        return validValue(entry.value, depth + 1, counter)
      })
    }
    default:
      return false
  }
}
export function validRawResult(value: unknown, command: RawCommand): value is RawResult<RawOutput> {
  if (!rawBounded(value) || !object(value)) return false
  if (value.ok === false) {
    if (
      !exact(value, ['ok', 'error']) ||
      !object(value.error) ||
      !codes.includes(value.error.code as RawCode)
    )
      return false
    return (
      exact(value.error, ['code']) ||
      (exact(value.error, ['code', 'details']) &&
        object(value.error.details) &&
        exact(value.error.details, ['limit']) &&
        typeof value.error.details.limit === 'string' &&
        /^[A-Z_]{1,40}$/.test(value.error.details.limit))
    )
  }
  if (value.ok !== true || !exact(value, ['ok', 'value']) || !object(value.value)) return false
  const result = value.value
  if (command.kind === 'open')
    return (
      exact(result, ['status', 'workspaceId', 'displayName']) &&
      result.status === 'opened' &&
      validId(result.workspaceId) &&
      typeof result.displayName === 'string' &&
      byteSize(result.displayName) <= RAW_LIMITS.addressBytes &&
      !/[/\x00]/.test(result.displayName)
    )
  if (command.kind === 'close') return exact(result, ['closed']) && result.closed === true
  if (command.kind === 'catalog')
    return (
      exact(result, ['workspaceId', 'catalogGeneration']) &&
      result.workspaceId === command.workspaceId &&
      validId(result.catalogGeneration)
    )
  if (command.kind === 'locate') {
    if (
      !exact(result, [
        'workspaceId',
        'catalogGeneration',
        'query',
        'status',
        'items',
        'truncated',
      ]) ||
      result.workspaceId !== command.workspaceId ||
      !validId(result.catalogGeneration) ||
      (command.catalogGeneration !== null &&
        result.catalogGeneration !== command.catalogGeneration) ||
      result.query !== command.query ||
      !['building', 'ready'].includes(String(result.status)) ||
      !Array.isArray(result.items) ||
      result.items.length > command.limit ||
      typeof result.truncated !== 'boolean'
    )
      return false
    if (result.status === 'building' || !command.query)
      return result.items.length === 0 && !result.truncated
    return (
      (!result.truncated || result.items.length > 0) &&
      result.items.every(
        (item, index, items) =>
          object(item) &&
          exact(item, ['name', 'source']) &&
          typeof item.name === 'string' &&
          validSource(item.source) &&
          item.source.workspaceId === command.workspaceId &&
          item.name === item.source.relativePath.split('/').at(-1) &&
          sourceMatchRank(item.source.relativePath, item.name, command.query) < 4 &&
          (index === 0 ||
            compareLocatorItems(
              items[index - 1] as LocatorItem,
              item as LocatorItem,
              command.query,
            ) < 0),
      )
    )
  }
  if (command.kind === 'release')
    return exact(result, ['released']) && typeof result.released === 'boolean'
  if (command.kind === 'directory') {
    if (
      !exact(result, ['workspaceId', 'directory', 'items', 'nextCursor', 'truncated']) ||
      result.workspaceId !== command.workspaceId ||
      result.directory !== command.directory ||
      !Array.isArray(result.items) ||
      result.items.length > command.limit ||
      !cursor(result.nextCursor) ||
      result.truncated !== (result.nextCursor !== null) ||
      (result.truncated && !result.items.length)
    )
      return false
    const names = new Set<string>()
    return result.items.every((entry, index, items) => {
      if (
        !object(entry) ||
        typeof entry.name !== 'string' ||
        !entry.name ||
        /[\\/:\x00]/.test(entry.name) ||
        entry.name === '.' ||
        entry.name === '..' ||
        names.has(entry.name)
      )
        return false
      const path = command.directory ? command.directory + '/' + entry.name : entry.name
      const valid =
        entry.kind === 'directory'
          ? exact(entry, ['kind', 'name', 'path']) &&
            validDirectoryPath(entry.path) &&
            entry.path === path
          : entry.kind === 'source' &&
            exact(entry, ['kind', 'name', 'source']) &&
            validSource(entry.source) &&
            entry.source.workspaceId === command.workspaceId &&
            entry.source.relativePath === path
      if (
        !valid ||
        (index &&
          compareDirectoryEntries(items[index - 1] as DirectoryEntry, entry as DirectoryEntry) >= 0)
      )
        return false
      names.add(entry.name)
      return true
    })
  }
  if (command.kind === 'info' || command.kind === 'reload')
    return (
      exact(result, ['source', 'revision', 'state', 'sizeBytes', 'validated']) &&
      validSource(result.source) &&
      validId(result.revision) &&
      typeof result.state === 'string' &&
      ['current', 'stale'].includes(result.state) &&
      integer(result.sizeBytes) &&
      typeof result.validated === 'boolean' &&
      sameSource(result.source, command.source)
    )
  const context = (address: unknown, revision: unknown): boolean =>
    validAddress(address) &&
    sameAddress(address, command.address) &&
    revision === command.expectedRevision
  if (command.kind === 'read')
    return (
      ((result.mode === 'summary' && exact(result, ['mode', 'node'])) ||
        (result.mode === 'complete' &&
          exact(result, ['mode', 'node', 'value']) &&
          byteSize(result.value) <= RAW_LIMITS.valueBytes &&
          validValue(result.value))) &&
      validSummary(result.node) &&
      context(result.node.address, result.node.revision) &&
      (result.mode !== 'complete' ||
        (object(result.value) && result.value.kind === result.node.kind && !result.node.truncated))
    )
  if (command.kind === 'children')
    return (
      exact(result, ['address', 'revision', 'items', 'nextCursor', 'truncated']) &&
      context(result.address, result.revision) &&
      Array.isArray(result.items) &&
      result.items.length <= command.limit &&
      result.items.every(
        (item, index, items) =>
          object(item) &&
          exact(item, ['ordinal', 'key', 'node']) &&
          integer(item.ordinal) &&
          (index === 0 ||
            (object(items[index - 1]) && Number(items[index - 1].ordinal) < item.ordinal)) &&
          (typeof item.key === 'string' || integer(item.key)) &&
          (typeof item.key === 'string' || item.key === item.ordinal) &&
          validSummary(item.node) &&
          item.node.revision === command.expectedRevision &&
          sameSource(item.node.address.source, command.address.source) &&
          item.node.address.pointer === command.address.pointer + '/' + escapePointer(item.key),
      ) &&
      cursor(result.nextCursor) &&
      typeof result.truncated === 'boolean' &&
      result.truncated === (result.nextCursor !== null)
    )
  return (
    exact(result, ['address', 'revision', 'kind', 'text', 'nextCursor', 'truncated']) &&
    context(result.address, result.revision) &&
    (result.kind === 'string' || result.kind === 'number') &&
    typeof result.text === 'string' &&
    [...result.text].length <= command.limit &&
    cursor(result.nextCursor) &&
    typeof result.truncated === 'boolean' &&
    result.truncated === (result.nextCursor !== null)
  )
}
