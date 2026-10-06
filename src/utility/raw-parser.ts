import { Tokenizer, TokenParser, TokenType as T } from '@streamparser/json'
import { createHash } from 'node:crypto'
import type { FileHandle } from 'node:fs/promises'
import { setImmediate as yieldTurn } from 'node:timers/promises'
import { byteSize, escapePointer, RAW_LIMITS, RawError } from '../shared/raw'
import type { JsonPointer, RawKind, RawScalar, RawValue, SourceRange } from '../shared/raw'

export class WorkBudget {
  bytes = 0
  tokens = 0
  private started = performance.now()
  constructor(
    public readonly signal: AbortSignal,
    public readonly limits: { readonly [Key in keyof typeof RAW_LIMITS]: number } = RAW_LIMITS,
  ) {}
  check(): void {
    if (this.signal.aborted) throw new RawError('CANCELLED')
    if (performance.now() - this.started > this.limits.workMs) this.fail('WORK_MS')
  }
  read(bytes: number): void {
    this.check()
    this.bytes += bytes
    if (this.bytes > this.limits.readBytes) this.fail('READ_BYTES')
  }
  token(): void {
    this.check()
    if (++this.tokens > this.limits.tokens) this.fail('TOKENS')
  }
  fail(limit: string): never {
    throw new RawError('RESOURCE_LIMIT', { limit })
  }
}
export type ParsedNode = {
  pointer: JsonPointer
  kind: RawKind
  range: SourceRange
  childCount: number | null
  preview: string | null
  ordinal: number
  key: string | number | null
}
type Frame = {
  pointer: JsonPointer
  kind: 'array' | 'object'
  start: number
  children: number
  key: string | undefined
  expectKey: boolean
  keys: Set<string>
  keyBytes: number
  ordinal: number
  parentKey: string | number | null
  value?: RawValue
}
export type ScanOptions = {
  pointer: JsonPointer
  materialize: boolean
  childrenAfter?: number
  childrenLimit?: number
  scalar?: boolean
}
export type ScanResult = {
  node: ParsedNode | null
  value: RawValue | null
  children: ParsedNode[]
  scalar: RawScalar | null
  hash: string | null
}

// 该成熟库公开允许覆盖 parseNumber，但声明仍固定为 number。转换只在此隔离；不执行 Number。
class LexemeTokenizer extends Tokenizer {
  protected override parseNumber(lexeme: string): number {
    return lexeme as unknown as number
  }
}
const whitespace = (byte: number): boolean =>
  byte === 32 || byte === 9 || byte === 10 || byte === 13
export function createJsonWalk(
  size: number,
  initialBudget: WorkBudget,
  options: ScanOptions,
  range: SourceRange | null = null,
  basePointer: JsonPointer = '' as JsonPointer,
  onFact?: (pointer: JsonPointer, kind: 'key' | 'value', text: string) => void,
  onNode?: (node: ParsedNode) => void,
) {
  let budget = initialBudget
  budget.check()
  const begin = range?.startByte ?? 0
  const end = range?.endByteExclusive ?? size
  if (end - begin > budget.limits.readBytes - budget.bytes) budget.fail('READ_BYTES')
  const tokenizer = new LexemeTokenizer({
    emitPartialTokens: true,
    stringBufferSize: 4096,
    numberBufferSize: 4096,
  })
  const grammar = new TokenParser({ keepStack: false, paths: [] })
  grammar.onValue = () => {}
  const hash = range ? null : createHash('sha256')
  const stack: Frame[] = []
  let bom = 0,
    position = begin,
    window = Buffer.alloc(0),
    windowStart = begin
  let examined = begin,
    lastNonWhitespace = begin - 1,
    lastTokenStart = begin
  let pending: { node: ParsedNode; scalar: RawScalar } | null = null
  let target: ParsedNode | null = null,
    targetValue: RawValue | null = null,
    targetScalar: RawScalar | null = null
  let collecting = options.materialize,
    valueNodes = 0,
    valueBytes = 0,
    activeKeys = 0,
    activeKeyBytes = 0
  let parseError: unknown = null
  const children: ParsedNode[] = []
  const disableValue = (): void => {
    collecting = false
    targetValue = null
    for (const frame of stack) frame.value = undefined
  }
  const account = (bytes: number, pointer: string): boolean => {
    if (!collecting || !(pointer === options.pointer || pointer.startsWith(options.pointer + '/')))
      return false
    const relativeDepth =
      pointer === options.pointer ? 0 : pointer.slice(options.pointer.length + 1).split('/').length
    valueBytes += bytes
    if (
      ++valueNodes > budget.limits.valueNodes ||
      relativeDepth > budget.limits.valueDepth ||
      valueBytes > budget.limits.valueBytes
    ) {
      disableValue()
      return false
    }
    return true
  }
  const advance = (until: number): void => {
    for (; examined < until; examined++) {
      const byte = window[examined - windowStart]
      if (byte === undefined) throw new RawError('PARSER_FAILURE')
      if (!whitespace(byte)) lastNonWhitespace = examined
    }
  }
  const complete = (node: ParsedNode, value?: RawValue): void => {
    onNode?.(node)
    if (node.pointer === options.pointer) {
      target = node
      targetValue = collecting ? (value ?? null) : null
    }
    const parent = stack.at(-1)
    if (
      parent?.pointer === options.pointer &&
      options.childrenLimit !== undefined &&
      node.ordinal > (options.childrenAfter ?? -1) &&
      children.length < options.childrenLimit + 1
    )
      children.push(node)
    if (collecting && value && parent?.value) {
      if (parent.value.kind === 'array') parent.value.items.push(value)
      else if (parent.value.kind === 'object')
        parent.value.entries.push({ key: String(node.key), value })
    }
  }
  const location = (): { pointer: JsonPointer; key: string | number | null; ordinal: number } => {
    const parent = stack.at(-1)
    const key = parent ? (parent.kind === 'array' ? parent.children : parent.key!) : null
    const pointer = parent ? parent.pointer + '/' + escapePointer(key!) : basePointer
    if (byteSize(pointer) > budget.limits.addressBytes) budget.fail('ADDRESS_BYTES')
    return { pointer: pointer as JsonPointer, key, ordinal: parent ? parent.children++ : 0 }
  }
  const flush = (): void => {
    if (!pending) return
    pending.node.range.endByteExclusive = lastNonWhitespace + 1
    if (
      pending.node.range.endByteExclusive - pending.node.range.startByte >
      budget.limits.tokenBytes
    )
      budget.fail('TOKEN_BYTES')
    let value: RawValue | undefined
    if (account(byteSize(pending.scalar), pending.node.pointer)) value = pending.scalar
    if (pending.node.pointer === options.pointer && options.scalar) targetScalar = pending.scalar
    complete(pending.node, value)
    pending = null
  }
  tokenizer.onError = (error) => {
    parseError ??= error
  }
  grammar.onError = (error) => {
    parseError ??= error
  }
  tokenizer.onToken = (info) => {
    if (parseError) return
    if (info.partial) return
    budget.token()
    const offset = info.offset + begin + bom
    if (offset - lastTokenStart > budget.limits.tokenBytes) budget.fail('TOKEN_BYTES')
    advance(offset)
    flush()
    lastTokenStart = offset
    grammar.write(info)
    if (parseError) return
    const { token, value } = info
    const frame = stack.at(-1)
    if (token === T.COLON) return
    if (token === T.COMMA) {
      if (frame?.kind === 'object') frame.expectKey = true
      return
    }
    if (token === T.RIGHT_BRACE || token === T.RIGHT_BRACKET) {
      const closed = stack.pop()!
      activeKeys -= closed.keys.size
      activeKeyBytes -= closed.keyBytes
      const node: ParsedNode = {
        pointer: closed.pointer,
        kind: closed.kind,
        range: { startByte: closed.start, endByteExclusive: offset + 1 },
        childCount: closed.children,
        preview: null,
        ordinal: closed.ordinal,
        key: closed.parentKey,
      }
      complete(node, closed.value)
      return
    }
    if (token === T.STRING && frame?.kind === 'object' && frame.expectKey) {
      const key = value as string
      if (frame.keys.has(key)) throw new RawError('AMBIGUOUS_OBJECT_KEY')
      const bytes = Buffer.byteLength(key)
      if (++activeKeys > budget.limits.keys || (activeKeyBytes += bytes) > budget.limits.keyBytes)
        budget.fail('DUPLICATE_KEYS')
      frame.keys.add(key)
      frame.keyBytes += bytes
      frame.key = key
      frame.expectKey = false
      if (collecting && frame.value) {
        valueBytes += byteSize({ key, value: null }) + 1
        if (valueBytes > budget.limits.valueBytes) disableValue()
      }
      return
    }
    const address = location()
    if (frame?.kind === 'object') onFact?.(address.pointer, 'key', frame.key!)
    if (token === T.LEFT_BRACE || token === T.LEFT_BRACKET) {
      if (stack.length >= budget.limits.depth) budget.fail('DEPTH')
      const kind = token === T.LEFT_BRACE ? 'object' : 'array'
      const retain = account(kind === 'object' ? 30 : 26, address.pointer)
      stack.push({
        pointer: address.pointer,
        kind,
        start: offset,
        children: 0,
        key: undefined,
        expectKey: kind === 'object',
        keys: new Set(),
        keyBytes: 0,
        ordinal: address.ordinal,
        parentKey: address.key,
        value: retain
          ? kind === 'object'
            ? { kind, entries: [] }
            : { kind, items: [] }
          : undefined,
      })
      return
    }
    const scalar: RawScalar =
      token === T.STRING
        ? { kind: 'string', value: value as string }
        : token === T.NUMBER
          ? { kind: 'number', lexeme: value as unknown as string }
          : token === T.NULL
            ? { kind: 'null' }
            : { kind: 'boolean', value: value as boolean }
    const text =
      scalar.kind === 'string'
        ? scalar.value
        : scalar.kind === 'number'
          ? scalar.lexeme
          : scalar.kind === 'boolean'
            ? String(scalar.value)
            : 'null'
    onFact?.(address.pointer, 'value', text)
    pending = {
      node: {
        ...address,
        kind: scalar.kind,
        range: { startByte: offset, endByteExclusive: offset },
        childCount: null,
        preview: [...text.slice(0, 512)].slice(0, 256).join(''),
      },
      scalar,
    }
  }
  let initialized = false,
    done = false
  let result: ScanResult | null = null
  const step = async (handle: FileHandle, nextBudget: WorkBudget): Promise<boolean> => {
    budget = nextBudget
    if (done) return true
    try {
      if (!initialized && !range) {
        const prefix = Buffer.alloc(3)
        const { bytesRead } = await handle.read(prefix, 0, 3, 0)
        budget.read(bytesRead)
        if (bytesRead === 3 && prefix[0] === 239 && prefix[1] === 187 && prefix[2] === 191) {
          bom = 3
          examined = 3
          windowStart = 3
          lastTokenStart = 3
        }
      }
      initialized = true
      if (position < end) {
        budget.check()
        const chunk = Buffer.alloc(Math.min(budget.limits.chunkBytes, end - position))
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, position)
        budget.read(bytesRead)
        if (!bytesRead) throw new RawError('SOURCE_CHANGED')
        const bytes = chunk.subarray(0, bytesRead)
        hash?.update(bytes)
        const skip = !range && position < bom ? Math.min(bytes.length, bom - position) : 0
        window = Buffer.concat([window, bytes.subarray(skip)])
        tokenizer.write(bytes.subarray(skip))
        if (parseError) throw parseError
        position += bytesRead
        if (position - lastTokenStart > budget.limits.tokenBytes) budget.fail('TOKEN_BYTES')
        const remove = examined - windowStart
        window = window.subarray(remove)
        windowStart = examined
        await yieldTurn()
      }
      if (position < end) return false
      tokenizer.end()
      if (parseError) throw parseError
      advance(end)
      flush()
      if (!grammar.isEnded) grammar.end()
      if (parseError) throw parseError
      if (stack.length) throw new RawError('INVALID_JSON')
      budget.check()
      if (targetValue && byteSize(targetValue) > budget.limits.valueBytes) targetValue = null
      result = {
        node: target,
        value: targetValue,
        children,
        scalar: targetScalar,
        hash: hash?.digest('hex') ?? null,
      }
      done = true
      return true
    } catch (error) {
      if (error instanceof RawError) throw error
      if (parseError) throw new RawError('INVALID_JSON')
      throw new RawError('PARSER_FAILURE')
    }
  }
  return {
    step,
    get position() {
      return position
    },
    get result() {
      return result
    },
  }
}

export async function scanJson(
  handle: FileHandle,
  size: number,
  budget: WorkBudget,
  options: ScanOptions,
  range: SourceRange | null = null,
  basePointer: JsonPointer = '' as JsonPointer,
): Promise<ScanResult> {
  const walk = createJsonWalk(size, budget, options, range, basePointer)
  while (!(await walk.step(handle, budget))) {}
  return walk.result!
}
