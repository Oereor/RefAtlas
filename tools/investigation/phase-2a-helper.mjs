// 非生产：成熟 tokenizer 的结构观察器；不自行识别 JSON 字节语法。
import { Tokenizer, TokenParser, TokenType as T } from '@streamparser/json';
import fs from 'node:fs';

export const escapePointer = key => String(key).replaceAll('~', '~0').replaceAll('/', '~1');
export const bytes = value => Buffer.byteLength(JSON.stringify(value));
export function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = q => sorted.length ? sorted[Math.ceil(q * sorted.length) - 1] : 0;
  return { count: sorted.length, p50: at(.5), p95: at(.95), p99: at(.99), max: at(1) };
}
export function page(items, after = -1, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('调查页大小 1..100');
  const selected = items.filter(item => item.ordinal > after).slice(0, limit);
  return { items: selected, next: selected.length === limit ? selected.at(-1).ordinal : null };
}
export function checkRevision(expected, actual) {
  if (expected !== actual) throw new Error('SOURCE_CHANGED');
}

// 输入为完整只读 Buffer：用于精确回读验证，不作为生产 streaming 内存证据。
export function inspectBuffer(buffer, { chunkSize = 65536, retainDepth = -1, onNode = () => {} } = {}) {
  // 0.0.26 接受 BOM，却不把 BOM 算入 token offset。显式跳过并恢复源字节基准。
  const bomBytes = buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? 3 : 0;
  const tokenizer = new Tokenizer();
  tokenizer.parseNumber = lexeme => lexeme;
  const grammar = new TokenParser({ keepStack: false, paths: [] });
  grammar.onValue = () => {};
  const stack = [];
  let pending;
  let root;
  const top = [];
  const topBytes = [];
  const topWire = [];
  const containers = [];
  const collectionSamples = new Map(['/Events', '/DimensionList', '/DimensionList/0/GroupList', '/Configs',
    '/StateHitLayerWeightMap', '/LodTemplateMap', '/OnStartSequece'].map(pointer => [pointer, { source: [], wire: [] }]));
  const numeric = { count: 0, unsafeInteger: 0, beyondSigned64: 0, scientific: 0, decimal: 0,
    negativeZero: 0, fractionalTrailingZero: 0, maxTokenBytes: 0, examples: {} };
  const strings = { count: 0, numericLooking: 0, maxUtf8Bytes: 0, longest: null, specialExamples: [] };
  const typeCounts = { null: 0, boolean: 0, string: 0, number: 0, array: 0, object: 0 };
  let maxDepth = 0;
  let duplicates = 0;
  let duplicateTrackingComplete = true;
  let largestTop;
  function example(kind, lexeme, pointer) {
    const list = numeric.examples[kind] ??= [];
    if (list.length < 3 && !list.some(x => x.lexeme === lexeme)) list.push({ lexeme, pointer });
  }
  function allocate(kind, offset, scalar) {
    const parent = stack.at(-1);
    const key = parent?.kind === 'array' ? parent.children : parent?.key;
    const pointer = parent ? parent.pointer + '/' + escapePointer(key) : '';
    const depth = stack.length;
    if (parent) parent.children++;
    const value = scalar ?? (kind === 'array' ? { kind, items: [] } : { kind, entries: [] });
    const node = { pointer, key, ordinal: parent ? parent.children - 1 : 0, kind, start: offset,
      depth, children: 0, scalar, wireBytes: scalar ? bytes(scalar) : bytes(value), value: depth <= retainDepth ? value : undefined };
    typeCounts[kind]++;
    maxDepth = Math.max(maxDepth, depth + (kind === 'object' || kind === 'array' ? 1 : 0));
    return node;
  }
  function complete(node, end) {
    node.end = end;
    node.sourceBytes = end - node.start;
    const parent = stack.at(-1);
    if (parent) {
      const sample = collectionSamples.get(parent.pointer);
      if (sample) { sample.source.push(node.sourceBytes); sample.wire.push(node.wireBytes); }
      parent.wireBytes += node.wireBytes + (parent.children > 1 ? 1 : 0);
      if (parent.kind === 'object') parent.wireBytes += bytes({ key: node.key, value: null }) - 4;
      if (parent.value) {
        if (!node.value) throw new Error('retainDepth 必须覆盖所需树');
        if (parent.kind === 'array') parent.value.items.push(node.value);
        else parent.value.entries.push({ key: node.key, value: node.value });
      }
    } else root = node;
    if (node.depth === 1) {
      topBytes.push(node.sourceBytes); topWire.push(node.wireBytes);
      if (top.length < 6) top.push(summary(node));
      if (!largestTop || node.sourceBytes > largestTop.sourceBytes) largestTop = summary(node);
    }
    if (node.depth <= 3 && (node.kind === 'array' || node.kind === 'object')) containers.push(summary(node));
    onNode(node);
  }
  function summary(node) {
    const { pointer, kind, ordinal, start, end, sourceBytes, wireBytes, children } = node;
    return { pointer, kind, ordinal, start, end, sourceBytes, wireBytes, children };
  }
  function flush(nextOffset) {
    if (!pending) return;
    let end = nextOffset;
    while (end > pending.start && [32, 10, 13, 9].includes(buffer[end - 1])) end--;
    complete(pending, end); pending = undefined;
  }
  tokenizer.onToken = info => {
    if (bomBytes) info = { ...info, offset: info.offset + bomBytes };
    flush(info.offset);
    grammar.write(info);
    const { token, value, offset } = info;
    const frame = stack.at(-1);
    if (token === T.COLON) return;
    if (token === T.COMMA) { if (frame?.kind === 'object') frame.expectKey = true; return; }
    if (token === T.RIGHT_BRACE || token === T.RIGHT_BRACKET) {
      const node = stack.pop(); complete(node, offset + 1); return;
    }
    if (token === T.STRING && frame?.kind === 'object' && frame.expectKey) {
      frame.key = value; frame.expectKey = false;
      if (frame.keys) {
        if (frame.keys.has(value)) duplicates++;
        frame.keys.add(value);
        if (frame.keys.size > 100000) { frame.keys = null; duplicateTrackingComplete = false; }
      }
      return;
    }
    if (token === T.LEFT_BRACE || token === T.LEFT_BRACKET) {
      const node = allocate(token === T.LEFT_BRACE ? 'object' : 'array', offset);
      node.expectKey = node.kind === 'object'; node.keys = node.kind === 'object' ? new Set() : null;
      stack.push(node); return;
    }
    const kind = token === T.STRING ? 'string' : token === T.NUMBER ? 'number' : token === T.NULL ? 'null' : 'boolean';
    const scalar = kind === 'number' ? { kind, lexeme: value } : kind === 'null' ? { kind } : { kind, value };
    pending = allocate(kind, offset, scalar);
    if (kind === 'number') {
      numeric.count++; numeric.maxTokenBytes = Math.max(numeric.maxTokenBytes, value.length);
      if (/^-?\d+$/.test(value)) {
        const n = BigInt(value);
        if (n > 9007199254740991n || n < -9007199254740991n) { numeric.unsafeInteger++; example('unsafeInteger', value, pending.pointer); }
        if (n > 9223372036854775807n || n < -9223372036854775808n) numeric.beyondSigned64++;
      }
      if (/[eE]/.test(value)) { numeric.scientific++; example('scientific', value, pending.pointer); }
      if (value.includes('.')) { numeric.decimal++; example('decimal', value, pending.pointer); }
      if (/^-0(?:\.0+)?(?:[eE][+-]?\d+)?$/.test(value)) { numeric.negativeZero++; example('negativeZero', value, pending.pointer); }
      if (/\.\d*0(?:[eE]|$)/.test(value)) { numeric.fractionalTrailingZero++; example('fractionalTrailingZero', value, pending.pointer); }
    }
    if (kind === 'string') {
      strings.count++;
      if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) strings.numericLooking++;
      const length = Buffer.byteLength(value);
      if (length > strings.maxUtf8Bytes) { strings.maxUtf8Bytes = length; strings.longest = { pointer: pending.pointer, preview: value.slice(0, 120) }; }
      if (strings.specialExamples.length < 3 && /[\p{Extended_Pictographic}]/u.test(value)) strings.specialExamples.push({ pointer: pending.pointer, preview: value.slice(0, 80) });
    }
  };
  for (let start = bomBytes; start < buffer.length; start += chunkSize) tokenizer.write(buffer.subarray(start, start + chunkSize));
  tokenizer.end(); flush(buffer.length);
  if (!grammar.isEnded) grammar.end();
  if (!root || stack.length) throw new Error('未完成 JSON');
  return { root: summary(root), raw: root.value, maxDepth, typeCounts, numeric, strings,
    duplicates, duplicateTrackingComplete, topExamples: top, largestTop,
    topSourceBytes: distribution(topBytes), topWireBytes: distribution(topWire),
    topWireWithin: Object.fromEntries([16384, 65536, 262144].map(budget => [budget, topWire.filter(n => n <= budget).length])),
    collectionDistributions: [...collectionSamples].filter(([, s]) => s.source.length).map(([pointer, s]) => ({ pointer,
      sourceBytes: distribution(s.source), wireBytes: distribution(s.wire),
      wireWithin: Object.fromEntries([16384, 65536, 262144].map(budget => [budget, s.wire.filter(n => n <= budget).length])) })),
    containers: containers.sort((a, b) => b.sourceBytes - a.sourceBytes).slice(0, 12) };
}
export function readSlice(filename, range, expectedHash, actualHash) {
  checkRevision(expectedHash, actualHash);
  const fd = fs.openSync(filename, 'r');
  try {
    const output = Buffer.alloc(range.end - range.start);
    if (fs.readSync(fd, output, 0, output.length, range.start) !== output.length) throw new Error('SOURCE_CHANGED');
    return output;
  } finally { fs.closeSync(fd); }
}
