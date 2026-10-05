// resolver 变更后的相关检查，保存新证据并原字节恢复旧 fixture evidence。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, output, scan, save, removeOwned } from './search2-lib.mjs';
import { resolveOccurrences, readSpoolPage } from './search2-resolve.mjs';
const oldPath = output('fixture-checks.json'), old = fs.readFileSync(oldPath);
try { await import('./search2-tests.mjs'); fs.copyFileSync(oldPath, output('controlled-retry/resolver-semantic-checks.json')); }
finally { fs.writeFileSync(oldPath, old); }
const rawName = 'resolver-owned-fixture.json', file = output(rawName), checks = [];
fs.writeFileSync(file, '[' + Array(80).fill('1').join(',') + ']');
try {
  const parsed = await scan(file), source = { id: 1, path: rawName, stamp: parsed.stamp, sha256: parsed.sha256, bytes: parsed.bytes };
  const q = { scope: 'NUMBER', match: 'exact', query: '1' }, options = { name: 'resolver-page.db', generation: 'query-one', cacheGeneration: 'cache-one', sourceRoot: root };
  const result = await resolveOccurrences(q, [source], options); assert.equal(result.count, 80);
  const page = readSpoolPage(options.name, options); assert.equal(page.rows.length, 50); assert(page.rows.every(r => r.fingerprint === source.sha256));
  const next = readSpoolPage(options.name, { ...options, cursor: page.nextCursor }); assert.equal(next.rows.length, 30); assert.equal(next.rows[0].id, 51);
  assert.deepEqual(readSpoolPage(options.name, options).rows, page.rows);
  assert.throws(() => readSpoolPage(options.name, { ...options, generation: 'query-two', cursor: page.nextCursor }), /STALE_QUERY_CURSOR/);
  assert.throws(() => readSpoolPage(options.name, { ...options, cacheGeneration: 'cache-two' }), /STALE_QUERY_CURSOR/);
  assert.throws(() => readSpoolPage(options.name, { ...options, limit: 51 }), /PAGE_LIMIT/);
  checks.push({ name: 'reopen, bounded 50/30 pages, immutable published rows and query/cache-generation rejection', passed: true });
  const controller = new AbortController();
  await assert.rejects(resolveOccurrences(q, [source], { ...options, name: 'resolver-cancel.db', signal: controller.signal, onChunk: async () => { const p = readSpoolPage('resolver-cancel.db', options); assert.equal(p.rows.length, 0); controller.abort(); } }), e => e.message === 'CANCELLED' && !e.observation.complete && e.observation.verifiedCount === 0);
  assert.equal(readSpoolPage('resolver-cancel.db', options).state, 'cancelled');
  checks.push({ name: 'last-chunk cancellation cannot publish complete; unverified occurrence rows stay invisible', passed: true });
  const c2 = new AbortController();
  await assert.rejects(resolveOccurrences(q, [source], { ...options, name: 'resolver-publish-cancel.db', signal: c2.signal, onSource: async () => c2.abort() }), e => e.message === 'CANCELLED' && !e.observation.complete && e.observation.verifiedCount === 80);
  checks.push({ name: 'cancellation after verified source publication still prevents query completion', passed: true });
  save('controlled-retry/spool-fixture-checks.json', { passed: true, checks, productionUnchanged: true }); console.log(JSON.stringify({ passed: true, checks }));
} finally {
  for (const name of [rawName, ...['resolver-page.db', 'resolver-cancel.db', 'resolver-publish-cancel.db'].flatMap(n => [n, n + '-wal', n + '-shm'])]) if (fs.existsSync(output(name))) removeOwned(name);
}
