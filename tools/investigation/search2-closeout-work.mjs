// 有界执行通道负载；不依赖全库索引，不导出 Search 性能结论。
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { dataRoot } from './common.mjs';
import { scan, stamp, guard, exactKey } from './search-lib.mjs';
import { resolveOccurrences } from './search2-resolve.mjs';
const root = path.join(import.meta.dirname, 'artifacts/search-round2/execution-lane-closeout');
const prefix = 'execution-lane-closeout/';
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'baseline.json')));
const now = () => performance.now();
const sources = paths => paths.map((p, i) => ({ ...baseline.sources.find(s => s.path === p), id: i + 1 }));
export function clean(name) {
  const target = path.resolve(root, name);
  if (path.dirname(target) !== fs.realpathSync(root)) throw Error('CLEANUP_ESCAPE');
  const removed = [];
  for (const s of ['', '-wal', '-shm']) if (fs.existsSync(target + s)) {
    if (fs.lstatSync(target + s).isSymbolicLink()) throw Error('CLEANUP_SYMLINK');
    removed.push({ name: name + s, bytes: fs.statSync(target + s).size }); fs.unlinkSync(target + s);
  }
  return removed;
}
const connect = name => { const d = new Database(path.join(root, name)); d.pragma('cache_size=-32768'); d.pragma('journal_mode=WAL'); d.pragma('temp_store=FILE'); d.pragma('synchronous=NORMAL'); return d; };
function recover(name) {
  const d = new Database(path.join(root, name));
  try { const check = d.pragma('quick_check')[0].quick_check; if (check !== 'ok') throw Error('REOPEN_INTEGRITY'); const spool = d.prepare("SELECT name FROM sqlite_master WHERE name='spool_meta'").get(); const publication = d.prepare("SELECT name FROM sqlite_master WHERE name='publication'").get(); return { quickCheck: check, state: spool ? d.prepare('SELECT state FROM spool_meta').get().state : publication ? d.prepare('SELECT state FROM publication').get().state : 'probe', handleClosed: true }; } finally { d.close(); }
}
async function buildLike(name, signal, emit) {
  const d = connect(name); let facts = 0, chunks = 0, completedSources = 0;
  try {
    d.exec("CREATE TABLE publication(state TEXT);INSERT INTO publication VALUES('staging');CREATE TABLE local(source_id INTEGER,k TEXT,n INTEGER,PRIMARY KEY(source_id,k)) WITHOUT ROWID;CREATE TABLE memberships(source_id INTEGER,k TEXT,n INTEGER,PRIMARY KEY(source_id,k)) WITHOUT ROWID;");
    const add = d.prepare('INSERT INTO local VALUES(?,?,1) ON CONFLICT(source_id,k) DO UPDATE SET n=n+1');
    for (const source of sources(baseline.workloads.buildPaths)) {
      guard(signal); d.exec('BEGIN');
      const parsed = await scan(path.join(dataRoot, source.path), { signal, onFact(f) { add.run(source.id, JSON.stringify([f.class, f.kind, exactKey(f.kind, f.text)])); facts++; }, afterChunk: async () => {
        d.exec('COMMIT'); chunks++; emit({ phase: 'batch-returned', time: Date.now(), facts, chunks }); guard(signal); d.exec('BEGIN');
      } });
      guard(signal);
      if (parsed.sha256 !== source.sha256 || parsed.stamp !== source.stamp) throw Error('SOURCE_CHANGED');
      d.exec('COMMIT'); completedSources++; emit({ phase: 'source-verified', time: Date.now(), completedSources, facts });
    }
    guard(signal); d.exec('BEGIN;INSERT INTO memberships SELECT * FROM local;UPDATE publication SET state=\'ready\';DELETE FROM local;COMMIT;');
    const memberships = d.prepare('SELECT count(*) n FROM memberships').get().n;
    return { completedSources, facts, chunks, memberships, complete: true, fullDataset: false };
  } catch (e) {
    if (d.inTransaction) d.exec('ROLLBACK');
    d.prepare('UPDATE publication SET state=?').run(e.message === 'CANCELLED' ? 'cancelled' : 'failed'); throw e;
  } finally { if (d.inTransaction) d.exec('ROLLBACK'); d.close(); }
}
export async function work(kind, { signal, emit, id, windowMs = 5000, failureMode = null } = {}) {
  const started = now(), beganAt = Date.now(), name = 'work-' + process.pid + '-' + id.replace(/[^a-z0-9]/gi, '') + '.db';
  let result, cancelled = false, iterations = 0, first = null, last = null, firstDigest = null, recovery, removed;
  const limitedEmit = value => { emit(value); if (failureMode === 'exit-at-batch' && ['batch-returned','chunk-returned'].includes(value.phase)) process.exit(23); };
  try {
    if (kind === 'js-probe' || kind === 'native-probe') {
      const callStart = Date.now(); emit({ phase: 'blocking-call-entered', time: callStart });
      if (kind === 'js-probe') { let n = 0; while (now() - started < 300) n++; result = { iterations: n }; }
      else { const d = connect(name); try { result = d.prepare('WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<500000) SELECT sum(x) sum FROM n').get(); if (result.sum !== 125000250000) throw Error('NATIVE_RESULT'); } finally { d.close(); } }
      emit({ phase: 'blocking-call-returned', time: Date.now(), callStart });
      // 让取消消息真正到达本线程；不宣称同步调用被中断。
      await new Promise(resolve => setTimeout(resolve, 30)); guard(signal);
    } else if (kind === 'build') result = await buildLike(name, signal, limitedEmit);
    else {
      const q = kind === 'selective-exact' ? { scope: 'VALUE', match: 'exact', query: '6186714091647966180' } : kind === 'selective-contains' ? { scope: 'STRING', match: 'contains', query: 'Monster_W1_Mecha' } : { scope: 'VALUE', match: 'exact', query: '1' };
      const list = sources(baseline.workloads[kind === 'selective-exact' ? 'exactPaths' : kind === 'selective-contains' ? 'containsPaths' : 'broadPaths']);
      do {
        guard(signal);
        const r = await resolveOccurrences(q, list, { name: prefix + name, signal, cacheGeneration: 'frozen-closeout-sources', onChunk: async m => limitedEmit({ phase: 'chunk-returned', time: Date.now(), ...m }), onSource: async (s, r) => limitedEmit({ phase: 'source-verified', time: Date.now(), path: s.path, count: r.count }) });
        iterations++; first ??= { count: r.count, identityDigest: r.orderedIdentityDigest, sources: r.scannedSources }; last = { count: r.count, complete: r.complete, fullMs: r.fullMs };
        if (firstDigest && firstDigest !== r.orderedIdentityDigest) throw Error('IDENTITY_CHANGED_BETWEEN_ITERATIONS'); firstDigest = r.orderedIdentityDigest;
        if (kind === 'selective-exact' && r.count !== 3) throw Error('CONTRADICTS_FROZEN_EXACT_TRUTH');
        recovery = recover(name); clean(name); emit({ phase: 'iteration-complete', time: Date.now(), iterations, count: r.count });
      } while (now() - started < windowMs);
      result = { query: q, iterations, first, last, complete: true, coverage: 'frozen supplied sources only', workspaceSearchComplete: false };
    }
  } catch (e) {
    if (e.message !== 'CANCELLED') throw e;
    cancelled = true; result = { complete: false, code: 'CANCELLED', observation: e.observation || null, iterations };
  } finally {
    if (fs.existsSync(path.join(root, name))) recovery = recover(name);
    removed = clean(name); emit({ phase: 'resources-released', time: Date.now(), recovery, removedBytes: removed.reduce((n, f) => n + f.bytes, 0) });
  }
  if (cancelled && recovery?.state === 'ready') throw Error('CANCELLED_STAGING_PUBLISHED');
  return { kind, ...result, cancelled, beganAt, endedAt: Date.now(), wallMs: now() - started, recovery, removed, owner: { pid: process.pid, nativeHandlesTransferred: false, handlesClosed: true }, rss: process.memoryUsage().rss, resourceUsage: process.resourceUsage() };
}
export function recoverFailureFiles(pid) {
  const files = fs.readdirSync(root).filter(n => n.startsWith('work-' + pid + '-') && n.endsWith('.db'));
  return files.map(name => { const recovery = recover(name); if (recovery.state === 'ready') throw Error('FAILURE_STAGING_PUBLISHED'); return { name, recovery, removed: clean(name) }; });
}
