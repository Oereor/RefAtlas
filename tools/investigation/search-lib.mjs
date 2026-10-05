// Investigation only. Mature tokenizer; no production schema/API and no source writes.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { Tokenizer, TokenParser, TokenType as T } from '@streamparser/json';
import Database from 'better-sqlite3';
import { dataRoot, artifactPath, gitState, samples, hashFile, environment } from './common.mjs';

export const root = artifactPath('search/run-marker').replace(/[\\/]run-marker$/, '');
export const output = name => path.join(root, name);
export const save = (name, value) => fs.writeFileSync(output(name), JSON.stringify(value, null, 2) + '\n');
export const now = () => performance.now();
export const escape = key => String(key).replaceAll('~', '~0').replaceAll('/', '~1');
export const exactKey = (kind, text) => kind === 'number' || kind === 'boolean' || kind === 'null' ? text : JSON.stringify(text);
export const cpLength = text => /^[\x00-\x7f]*$/.test(text) ? text.length : [...text].length;
export function literalContains(text, query) {
  if(query==='')return true;
  const high=n=>n>=0xd800&&n<=0xdbff,low=n=>n>=0xdc00&&n<=0xdfff;
  for(let i=text.indexOf(query);i>=0;i=text.indexOf(query,i+1)) {
    const end=i+query.length;
    if(i>0&&low(text.charCodeAt(i))&&high(text.charCodeAt(i-1)))continue;
    if(end<text.length&&high(text.charCodeAt(end-1))&&low(text.charCodeAt(end)))continue;
    return true;
  }
  return false;
}
export const stamp = s => [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':');
export function guard(signal) {
  if (signal?.aborted) throw new Error('CANCELLED');
  if (process.memoryUsage().rss > 2 * 1024 ** 3) throw new Error('RESOURCE_LIMIT_RSS');
}
export function database(name, readonly = false) {
  const db = new Database(output(name), { readonly });
  db.pragma('cache_size=-32768');
  db.pragma('temp_store=FILE');
  if (!readonly) { db.pragma('journal_mode=WAL'); db.pragma('synchronous=NORMAL'); db.pragma('wal_autocheckpoint=2048'); }
  return db;
}
export function disk(name) {
  return Object.fromEntries(['', '-wal', '-shm'].map(s => [s || 'db', fs.existsSync(output(name + s)) ? fs.statSync(output(name + s)).size : 0]));
}
export async function inventory() {
  const files = [];
  async function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const filename = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('SYMLINK_SOURCE');
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        const s = fs.statSync(filename, { bigint: true });
        files.push({ path: path.relative(dataRoot, filename).replaceAll('\\', '/'), bytes: Number(s.size), stamp: stamp(s) });
      }
    }
  }
  await walk(dataRoot);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return files;
}
export async function audit() {
  const fingerprints = [];
  for (const relative of [...samples, 'TextMap/TextMapJP.json']) {
    const filename = path.join(dataRoot, relative), s = fs.statSync(filename, { bigint: true });
    fingerprints.push({ path: relative, bytes: Number(s.size), stamp: stamp(s), sha256: await hashFile(filename) });
  }
  return { repository: gitState(), fingerprints, environment: environment() };
}
export function histogram() {
  const bins = new Map();
  return { add(n) { bins.set(n, (bins.get(n) || 0) + 1); }, result() {
    const sorted = [...bins].sort((a, b) => a[0] - b[0]), count = sorted.reduce((n, x) => n + x[1], 0);
    const percentile = q => { let n = 0; for (const [length, frequency] of sorted) { n += frequency; if (n >= Math.ceil(count * q)) return length; } return 0; };
    return { count, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: percentile(1) };
  } };
}

// Full occurrence observer. Shares production tokenizer/grammar/number override and Pointer rules.
// 64 KiB chunks, 16 MiB token / 256 depth / 120s source guards are investigation limits.
// RawDataService's narrower budgets are never changed. Whole scalars still materialize below this guard.
export async function scan(filename, { onFact = () => {}, onContainer = () => {}, signal, chunkBytes = 65536, afterChunk = async () => {}, containerQueries = [], allowDuplicateKeys = false } = {}) {
  const started = now(), handle = await fs.promises.open(filename, 'r'), before = await handle.stat({ bigint: true });
  const hash = createHash('sha256'), decoder = new TextDecoder('utf-8', { fatal: true });
  const tokenizer = new Tokenizer({ emitPartialTokens: true, stringBufferSize: 4096, numberBufferSize: 4096 });
  tokenizer.parseNumber = lexeme => lexeme;
  const grammar = new TokenParser({ paths: [], keepStack: false });
  grammar.onValue = () => {};
  const stack = [];
  let pending, parseError, position = 0, bom = 0, window = Buffer.alloc(0), windowStart = 0, examined = 0, lastNonWhite = -1, lastToken = 0;
  let tokenCount = 0, facts = 0, parseMs = 0, readMs = 0, maxDepth = 0, maxToken = 0, maxPointerBytes = 0, duplicateKeys = 0;
  const white = b => b === 32 || b === 9 || b === 10 || b === 13;
  function advance(until) { for (; examined < until; examined++) { const b = window[examined - windowStart]; if (b === undefined) throw new Error('RANGE_WINDOW'); if (!white(b)) lastNonWhite = examined; } }
  function emit(fact) { facts++; maxPointerBytes = Math.max(maxPointerBytes, Buffer.byteLength(fact.pointer)); onFact(fact); }
  function addSerialized(text, length) {
    const frame = stack.at(-1); if (!frame) return;
    frame.serializedBytes += length;
    for (let i = 0; i < containerQueries.length; i++) if (text?.includes(containerQueries[i])) frame.matches.add(i);
  }
  function flush() {
    if (!pending) return;
    pending.end = lastNonWhite + 1;
    if(pending.end-pending.start>16*1024**2)throw new Error('RESOURCE_LIMIT_TOKEN');
    // Existing mature tokenizer loses U+FEFF through its per-span TextDecoder.
    // Decode only the bounded quoted string token with native JSON.parse (never numbers).
    // This is an investigation correction, not a production adapter fix.
    if (pending.kind === 'string') pending.text = JSON.parse(window.subarray(pending.start-windowStart,pending.end-windowStart).toString('utf8'));
    maxToken = Math.max(maxToken, pending.end - pending.start);
    emit(pending);
    const serialized = pending.kind === 'string' ? JSON.stringify(pending.text) : pending.text;
    addSerialized(serialized, Buffer.byteLength(serialized));
    pending = undefined;
  }
  function locate(kind, start) {
    const parent = stack.at(-1), key = parent ? parent.kind === 'array' ? parent.children : parent.key : null;
    const pointer = parent ? parent.pointer + '/' + escape(key) : '';
    if (parent) {
      if (parent.children++) parent.serializedBytes++;
      if (parent.kind === 'object') {
        const keyText = JSON.stringify(key);
        addSerialized(keyText, Buffer.byteLength(keyText) + 1);
        emit({ class: 'FIELD', kind: 'field', valueKind: kind, pointer, text: key, start: parent.keyStart, end: parent.keyEnd, order: parent.keyStart, depth: stack.length });
      }
    }
    maxDepth = Math.max(maxDepth, stack.length);
    return { class: 'VALUE', kind, pointer, start, order: start, depth: stack.length };
  }
  tokenizer.onError = e => { parseError ??= e; };
  grammar.onError = e => { parseError ??= e; };
  tokenizer.onToken = info => {
    if (parseError || info.partial) return;
    tokenCount++;
    const offset = info.offset + bom;
    advance(offset); flush(); lastToken = offset;
    grammar.write(info); if (parseError) return;
    const frame = stack.at(-1), { token, value } = info;
    if (token === T.COLON) {
      frame.keyEnd = lastNonWhite + 1;
      if(frame.keyEnd-frame.keyStart>16*1024**2)throw new Error('RESOURCE_LIMIT_TOKEN');
      frame.key=JSON.parse(window.subarray(frame.keyStart-windowStart,frame.keyEnd-windowStart).toString('utf8'));
      if(frame.keys.has(frame.key)){duplicateKeys++;if(!allowDuplicateKeys)throw new Error('AMBIGUOUS_OBJECT_KEY');}
      frame.keys.add(frame.key);return;
    }
    if (token === T.COMMA) { if (frame?.kind === 'object') frame.expectKey = true; return; }
    if (token === T.RIGHT_BRACE || token === T.RIGHT_BRACKET) {
      const closed = stack.pop(); closed.end = offset + 1;
      onContainer({ pointer: closed.pointer, kind: closed.kind, start: closed.start, end: closed.end, depth: closed.depth, serializedBytes: closed.serializedBytes, matchedQueries: [...closed.matches] });
      const parent = stack.at(-1);
      if (parent) { parent.serializedBytes += closed.serializedBytes; for (const q of closed.matches) parent.matches.add(q); }
      return;
    }
    if (token === T.STRING && frame?.kind === 'object' && frame.expectKey) {
      frame.key = value; frame.keyStart = offset; frame.expectKey = false; return;
    }
    if (token === T.LEFT_BRACE || token === T.LEFT_BRACKET) {
      if (stack.length >= 256) throw new Error('RESOURCE_LIMIT_DEPTH');
      const node = locate(token === T.LEFT_BRACE ? 'object' : 'array', offset);
      stack.push({ ...node, children: 0, expectKey: node.kind === 'object', keys: new Set(), serializedBytes: 2, matches: new Set() }); return;
    }
    const kind = token === T.STRING ? 'string' : token === T.NUMBER ? 'number' : token === T.NULL ? 'null' : 'boolean';
    pending = { ...locate(kind, offset), text: kind === 'null' ? 'null' : kind === 'boolean' ? String(value) : value };
  };
  try {
    const prefix = Buffer.alloc(3);
    const prefixRead = await handle.read(prefix, 0, 3, 0);
    if (prefixRead.bytesRead === 3 && prefix.equals(Buffer.from([239, 187, 191]))) { bom = 3; examined = windowStart = lastToken = 3; }
    while (position < Number(before.size)) {
      guard(signal);
      if (now() - started > 120000) throw new Error('RESOURCE_LIMIT_SOURCE_TIME');
      const chunk = Buffer.alloc(Math.min(chunkBytes, Number(before.size) - position));
      const readStarted = now(), { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
      readMs += now() - readStarted;
      if (!bytesRead) throw new Error('SOURCE_CHANGED');
      const bytes = chunk.subarray(0, bytesRead); hash.update(bytes); decoder.decode(bytes, { stream: true });
      const skip = position < bom ? Math.min(bytesRead, bom - position) : 0;
      window = Buffer.concat([window, bytes.subarray(skip)]);
      const p = now(); tokenizer.write(bytes.subarray(skip)); parseMs += now() - p;
      if (parseError) throw /^(AMBIGUOUS_OBJECT_KEY|RESOURCE_LIMIT)/.test(parseError.message) ? parseError : new Error('INVALID_JSON', { cause: parseError });
      position += bytesRead;
      if (position - lastToken > 16 * 1024 ** 2) throw new Error('RESOURCE_LIMIT_TOKEN');
      window = window.subarray(examined - windowStart); windowStart = examined;
      await afterChunk(); await yieldTurn();
    }
    decoder.decode(); tokenizer.end(); advance(position); flush();
    if (!grammar.isEnded) grammar.end();
    if (parseError) throw /^(AMBIGUOUS_OBJECT_KEY|RESOURCE_LIMIT)/.test(parseError.message) ? parseError : new Error('INVALID_JSON', { cause: parseError });
    if (stack.length) throw new Error('INVALID_JSON');
    const after = await handle.stat({ bigint: true }), atPath = await fs.promises.stat(filename, { bigint: true });
    if (stamp(before) !== stamp(after) || stamp(after) !== stamp(atPath)) throw new Error('SOURCE_CHANGED');
    return { sha256: hash.digest('hex'), stamp: stamp(after), bytes: position, facts, tokenCount, maxDepth, maxToken, maxPointerBytes, duplicateKeys, readMs, parseMs, wallMs: now() - started };
  } finally { await handle.close(); }
}
