// 自有 1M FIELD/VALUE fixture：测 spool/分页/排序；不外推为全库 broad SLA。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { root, output, stamp, db, save, now, disk, removeOwned, resultIdentity, progress } from './search2-lib.mjs';
import { resolveOccurrences, readSpoolPage } from './search2-resolve.mjs';
import { referenceScan } from './search2-reference.mjs';
const raw = '[' + Array(5000).fill('{"needle":"needle"}').join(',') + ']';
const sha256 = createHash('sha256').update(raw).digest('hex'), sources = [], files = [], name = 'million-spool.db';
const q = { scope: 'ALL', match: 'exact', query: 'needle' }, options = { name, sourceRoot: root, generation: 'million-query', cacheGeneration: 'owned-fixture-cache' };
const began = now(); let firstPageMs = null, firstPageRows = null, maxDb = 0, maxWal = 0;
try {
  for (let i = 0; i < 100; i++) { const relative = 'million-fixture-' + String(i).padStart(3, '0') + '.json', file = output(relative); if (fs.existsSync(file)) throw Error('FIXTURE_EXISTS'); fs.writeFileSync(file, raw); files.push(relative); sources.push({ id: i + 1, path: relative, stamp: stamp(fs.statSync(file, { bigint: true })), sha256, bytes: Buffer.byteLength(raw) }); }
  const resolveStart = now();
  const result = await resolveOccurrences(q, sources, { ...options, onChunk: async () => { const size = disk(name); maxDb = Math.max(maxDb, size.db); maxWal = Math.max(maxWal, size['-wal']); }, onSource: async (_, record) => {
    if (firstPageMs === null) { const page = readSpoolPage(name, options); firstPageMs = now() - resolveStart; firstPageRows = page.rows.length; }
    if (record.path.endsWith('024.json') || record.path.endsWith('049.json') || record.path.endsWith('074.json')) progress({ stage: 'million-spool', source: record.path, elapsedMs: now() - resolveStart, dbBytes: disk(name).db });
  } });
  assert.equal(result.count, 1000000); assert.equal(result.verifiedCount, 1000000);
  const tail = readSpoolPage(name, { ...options, cursor: { generation: options.generation, cacheGeneration: options.cacheGeneration, after: 999950 } }); assert.equal(tail.rows.length, 50); assert.equal(tail.rows.at(-1).id, 1000000);
  const d = db(name, true); let globalSortMs, globalRows;
  try { const t = now(); globalRows = d.prepare('SELECT r.class,s.path,r.pointer_key FROM results r JOIN query_sources s ON s.id=r.source_id WHERE r.verified=1 ORDER BY r.class,s.path,r.pointer_key LIMIT 50').all(); globalSortMs = now() - t; assert(globalRows.every(r => r.class === 'FIELD')); } finally { d.close(); }
  const truthStart = now(), digest = createHash('sha256'); let count = 0;
  for (const source of sources) { const parsed = await referenceScan(path.join(root, source.path), { onFact(f) { if (f.text === q.query) { count++; digest.update(resultIdentity(f, source.path, source.sha256) + '\n'); } } }); assert.equal(parsed.sha256, source.sha256); }
  assert.equal(count, result.count); assert.equal(digest.digest('hex'), result.orderedIdentityDigest);
  const { sourceResults, ...compact } = result;
  save('million-spool.json', { complete: true, fixtureScope: '100 owned sources x 5000 objects, 1M matching FIELD+VALUE; no external source copy', rawBytes: sources.reduce((n, s) => n + s.bytes, 0), resolution: compact, firstPageMs, firstPageRows, observedDbHighWater: Math.max(maxDb, disk(name).db), observedWalHighWater: maxWal, globalSortMs, globalFullMaterializationFirstPageMs: result.fullMs + globalSortMs, globalOrder: 'class/path/canonical Pointer BINARY; waits for all rows in this prototype, not a theoretical lower bound', independentTruthMs: now() - truthStart, identityParity: true, tailPageRows: tail.rows.length, wallMs: now() - began, pageSize: 50, previewCodePoints: 256 });
  console.log(JSON.stringify({ complete: true, count, firstPageMs, fullMs: result.fullMs, globalSortMs, dbBytes: disk(name).db }));
} finally { for (const relative of [...files, name, name + '-wal', name + '-shm']) if (fs.existsSync(output(relative))) removeOwned(relative); }
