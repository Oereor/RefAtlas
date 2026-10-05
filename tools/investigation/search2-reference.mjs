// 独立 stream-json reference：逐源 membership 校验；不依赖旧 B、不保存 occurrence truth。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import parser from 'stream-json/parser.js';
import { db, load, save, dataRoot, typedKey, stamp, guard, now, safety, progress } from './search2-lib.mjs';

export async function referenceScan(filename, { onFact = () => {}, signal, chunkBytes = 65536 } = {}) {
  const handle = await fs.promises.open(filename, 'r'), before = stamp(await handle.stat({ bigint: true }));
  const started = now(), hash = createHash('sha256'), stack = []; let bytes = 0, duplicateKeys = 0, tokens = 0;
  const esc = s => s.replaceAll('~', '~0').replaceAll('/', '~1');
  const locate = kind => {
    const parent = stack.at(-1), key = parent ? parent.array ? parent.count : parent.key : null;
    const pointer = parent ? parent.pointer + '/' + esc(String(key)) : '';
    if (parent) { parent.count++; if (!parent.array) onFact({ class: 'FIELD', kind: 'field', valueKind: kind, pointer, text: key }); }
    return pointer;
  };
  try {
    if (stamp(await fs.promises.stat(filename, { bigint: true })) !== before) throw Error('REFERENCE_PATH_HANDLE_CHANGED');
    const stream = handle.createReadStream({ autoClose: false, highWaterMark: chunkBytes });
    stream.on('data', chunk => { hash.update(chunk); bytes += chunk.length; });
    await pipeline(stream, parser.asStream({ streamKeys: false, streamStrings: false, streamNumbers: false }), new Writable({ objectMode: true, write(t, _, done) {
      try {
        if (signal?.aborted) throw Error('CANCELLED');
        if (++tokens % 4096 === 0) { guard(signal); if (now() - started > 120000) throw Error('REFERENCE_SOURCE_TIMEOUT'); }
        if (typeof t.value === 'string' && Buffer.byteLength(t.value) > 16 * 1024 ** 2) throw Error('REFERENCE_PACKED_TOKEN_LIMIT');
        if (t.name === 'keyValue') { const p = stack.at(-1); if (p.keys.has(t.value)) duplicateKeys++; p.keys.add(t.value); p.key = t.value; }
        else if (t.name === 'startObject' || t.name === 'startArray') { if (stack.length >= 256) throw Error('REFERENCE_DEPTH_LIMIT'); stack.push({ pointer: locate(t.name === 'startObject' ? 'object' : 'array'), array: t.name === 'startArray', count: 0, keys: new Set() }); }
        else if (t.name === 'endObject' || t.name === 'endArray') stack.pop();
        else if (['stringValue', 'numberValue', 'trueValue', 'falseValue', 'nullValue'].includes(t.name)) {
          const kind = t.name === 'stringValue' ? 'string' : t.name === 'numberValue' ? 'number' : t.name === 'nullValue' ? 'null' : 'boolean';
          onFact({ class: 'VALUE', kind, pointer: locate(kind), text: kind === 'null' ? 'null' : String(t.value) });
        }
        done();
      } catch (e) { done(e); }
    } }));
    if (stack.length || before !== stamp(await handle.stat({ bigint: true })) || before !== stamp(await fs.promises.stat(filename, { bigint: true }))) throw Error('REFERENCE_SOURCE_CHANGED');
    return { stamp: before, sha256: hash.digest('hex'), bytes, duplicateKeys, wallMs: now() - started };
  } finally { await handle.close(); }
}

export async function validateMemberships() {
  const acceptance = load('controlled-retry/terminal-audit.json').acceptance;
  if (!acceptance.fullS1AcceptedForNextGate) throw Error('NO_FULL_S1_ACCEPTANCE');
  safety(1024 ** 3);
  const d = db('s1.db', true), stage = db('reference-staging.db'), census = load('s1.db-census.json'), began = now();
  stage.exec('CREATE TABLE local(k TEXT PRIMARY KEY,n INTEGER) WITHOUT ROWID;');
  const put = stage.prepare('INSERT INTO local VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=n+excluded.n'), get = stage.prepare('SELECT n FROM local WHERE k=?');
  const indexed = d.prepare('SELECT t.class,t.kind,t.exact_key,m.n FROM memberships m JOIN terms t ON t.id=m.term_id WHERE m.source_id=?');
  const sources = d.prepare('SELECT * FROM files ORDER BY id').all();
  let memberships = 0, occurrences = 0, spillSources = 0, maxRss = 0, sourcesChecked = 0;
  const types = {}, identity = createHash('sha256'), ambiguous = [];
  try {
    for (const source of sources) {
      guard(); stage.exec('DELETE FROM local'); let map = new Map(), accounted = 0, spilled = false;
      const flush = stage.transaction(() => { for (const [k, n] of map) put.run(k, n); map.clear(); accounted = 0; });
      const counts = {};
      const parsed = await referenceScan(path.join(dataRoot, source.path), { onFact(f) {
        const k = typedKey(f); if (!map.has(k)) accounted += Buffer.byteLength(k) + 2 * k.length + 160;
        map.set(k, (map.get(k) || 0) + 1); counts[f.kind] = (counts[f.kind] || 0) + 1;
        if (accounted > 32 * 1024 ** 2) { flush(); if (!spilled) spillSources++; spilled = true; }
      } });
      if (spilled) flush();
      const expectedCount = spilled ? stage.prepare('SELECT count(*) n FROM local').get().n : map.size;
      let actualCount = 0;
      for (const t of indexed.iterate(source.id)) {
        const key = JSON.stringify([t.class, t.kind, t.exact_key]);
        const expected = spilled ? get.get(key)?.n : map.get(key);
        if (expected !== t.n) throw Error('MEMBERSHIP_LITERAL_OR_COUNT_MISMATCH:' + source.path);
        actualCount++; identity.update(JSON.stringify([source.path, key, t.n, source.sha256]) + '\n');
        types[t.kind] ??= { memberships: 0, occurrences: 0 }; types[t.kind].memberships++; types[t.kind].occurrences += t.n;
      }
      const observed = census.sources[source.id - 1];
      if (actualCount !== expectedCount || parsed.sha256 !== source.sha256 || parsed.stamp !== source.stamp || parsed.bytes !== source.bytes || parsed.duplicateKeys !== observed.duplicateKeys || JSON.stringify(Object.entries(counts).sort()) !== JSON.stringify(Object.entries(observed.occurrences).sort())) throw Error('REFERENCE_SOURCE_CENSUS_MISMATCH:' + source.path);
      if (parsed.duplicateKeys) ambiguous.push({ path: source.path, duplicateKeys: parsed.duplicateKeys });
      memberships += actualCount; occurrences += Object.values(counts).reduce((n, v) => n + v, 0); sourcesChecked++; maxRss = Math.max(maxRss, process.memoryUsage().rss);
      map.clear(); stage.pragma('wal_checkpoint(TRUNCATE)');
      if (sourcesChecked % 5000 === 0 || sourcesChecked === sources.length) { const p = { stage: 'independent-memberships', sourcesChecked, memberships, occurrences, wallMs: now() - began }; progress(p); save('reference-progress.json', p); }
    }
    const result = { complete: true, sourcesChecked, memberships, occurrences, types, ambiguous, spillSources, maxRss, wallMs: now() - began, independentParser: 'stream-json 3.7.0; packed numeric lexeme; no Assembler', orderedMembershipDigest: identity.digest('hex'), noFalseNegativeMemberships: true, noOccurrenceTruthDatabase: true, limitNote: '32 MiB dedup accounting plus RSS guard; stream-json packs each token before the 16 MiB decoded-token check; not arbitrary-source constant-memory proof' };
    save('reference-memberships.json', result); return result;
  } finally { stage.close(); d.close(); }
}
if (process.argv[1] === import.meta.filename) console.log(JSON.stringify(await validateMemberships()));
