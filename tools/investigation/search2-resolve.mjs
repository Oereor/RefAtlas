// Investigation-only streaming resolver and ephemeral query spool.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db, scan, exactKey, factMatches, resultIdentity, now, output, dataRoot, stamp, disk, yieldTurn, guard } from './search2-lib.mjs';

export async function candidates(d, q, { signal } = {}) {
  const began = now(), sourceIds = new Set(); let termCount = 0, dictionaryMs = 0, expansionMs = 0, dedupeMs = 0, batches = 0;
  const posting = d.prepare("SELECT m.source_id FROM memberships m JOIN files f ON f.id=m.source_id WHERE term_id=? AND f.state='ready'");
  let rows;
  if (q.match === 'exact') {
    const kinds = q.scope === 'VALUE' ? ['string', 'number', 'boolean', 'null'] : q.scope === 'FIELD' ? ['field'] : [q.scope.toLowerCase()];
    rows = kinds.map(kind => d.prepare('SELECT id,class,kind,exact_key,scan_text FROM terms WHERE class=? AND kind=? AND exact_key=?').get(kind === 'field' ? 'FIELD' : 'VALUE', kind, exactKey(kind, q.query))).filter(Boolean);
    dictionaryMs = now() - began;
    for (const t of rows) { termCount++; const start = now(); for (const p of posting.iterate(t.id)) { const s = now(); sourceIds.add(p.source_id); dedupeMs += now() - s; } expansionMs += now() - start; }
  } else {
    let after = 0;
    const range = d.prepare('SELECT id,class,kind,exact_key,scan_text FROM terms WHERE id>? ORDER BY id LIMIT 2048');
    while (true) {
      guard(signal); const start = now(), batch = range.all(after); if (!batch.length) break;
      const hits = batch.filter(t => factMatches(q, { ...t, text: t.scan_text ?? (t.kind === 'string' || t.kind === 'field' ? JSON.parse(t.exact_key) : t.exact_key) }));
      dictionaryMs += now() - start;
      for (const t of hits) { termCount++; const start = now(); for (const p of posting.iterate(t.id)) { const s = now(); sourceIds.add(p.source_id); dedupeMs += now() - s; } expansionMs += now() - start; }
      after = batch.at(-1).id; batches++; await yieldTurn();
    }
  }
  const catalogStart = now(), get = d.prepare('SELECT * FROM files WHERE id=?'), sources = [...sourceIds].sort((a, b) => a - b).map(id => get.get(id));
  return { sources, metrics: { lookupMs: now() - began, dictionaryMs, expansionMs: expansionMs - dedupeMs, dedupeMs, catalogMs: now() - catalogStart, matchingTerms: termCount, candidateSources: sources.length, candidateBytes: sources.reduce((n, f) => n + f.bytes, 0), batches } };
}

export async function resolveOccurrences(q, sources, { name = 'query-spool.db', signal, candidateMs = 0, onChunk = async () => {}, onSource = async () => {}, spool = true, sourceRoot = dataRoot } = {}) {
  if (spool && fs.existsSync(output(name))) throw Error('SPOOL_EXISTS');
  const d = spool ? db(name) : null, started = now(), digest = createHash('sha256');
  if (d) d.exec('CREATE TABLE results(id INTEGER PRIMARY KEY,source_id INTEGER,class TEXT,kind TEXT,value_kind TEXT,pointer_key TEXT,exact_key TEXT,preview TEXT,start INTEGER,end INTEGER,verified INTEGER DEFAULT 0);');
  const add = d?.prepare('INSERT INTO results(source_id,class,kind,value_kind,pointer_key,exact_key,preview,start,end) VALUES(?,?,?,?,?,?,?,?,?)');
  let count = 0, verifiedCount = 0, scannedSources = 0, readMs = 0, parseMs = 0, openStatMs = 0, first = null, first10 = null, first50 = null, verifiedFirst = null, verified10 = null, verified50 = null, walPeak = 0, maxRss = 0;
  const examples = [], sourceResults = [], timings = [], errors = [];
  const observeCount = () => { const t = candidateMs + now() - started; if (count >= 1 && first === null) first = t; if (count >= 10 && first10 === null) first10 = t; if (count >= 50 && first50 === null) first50 = t; };
  try {
    for (const source of sources) {
      guard(signal); const p = path.join(sourceRoot, source.path), checkStart = now();
      const handle = await fs.promises.open(p, 'r'); let current; try { current = stamp(await handle.stat({ bigint: true })); } finally { await handle.close(); }
      const pathStamp = stamp(await fs.promises.stat(p, { bigint: true })); openStatMs += now() - checkStart;
      if (current !== source.stamp || current !== pathStamp) throw Error('STALE_CANDIDATE_SOURCE');
      const before = count, sourceDigest = createHash('sha256'), sourceStart = now(); d?.exec('BEGIN');
      const parsed = await scan(p, { signal, onFact(f) {
        if (!factMatches(q, f)) return;
        const identity = resultIdentity(f, source.path, source.sha256) + '\n'; digest.update(identity); sourceDigest.update(identity); count++;
        add?.run(source.id, f.class, f.kind, f.valueKind || f.kind, JSON.stringify(f.pointer), exactKey(f.kind, f.text), JSON.stringify([...f.text].slice(0, 256).join('')), f.start, f.end);
        if (examples.length < 5) examples.push({ path: source.path, pointer: f.pointer, factKind: f.class, rawType: f.valueKind || f.kind, preview: [...f.text].slice(0, 120).join(''), fingerprint: source.sha256, range: { startByte: f.start, endByteExclusive: f.end, role: f.class === 'FIELD' ? 'key token, not value range' : 'value token' } });
        observeCount();
      }, afterChunk: async () => { if (d) { d.exec('COMMIT'); walPeak = Math.max(walPeak, disk(name)['-wal']); d.exec('BEGIN'); } maxRss = Math.max(maxRss, process.memoryUsage().rss); await onChunk({ count, verifiedCount, scannedSources, elapsedMs: now() - started }); } });
      if (parsed.sha256 !== source.sha256 || parsed.stamp !== source.stamp) throw Error('SOURCE_FINGERPRINT_CHANGED');
      d?.prepare('UPDATE results SET verified=1 WHERE id>?').run(before); d?.exec('COMMIT');
      verifiedCount = count; scannedSources++; readMs += parsed.readMs; parseMs += parsed.parseMs;
      const t = candidateMs + now() - started;
      if (count && verifiedFirst === null) verifiedFirst = t; if (count >= 10 && verified10 === null) verified10 = t; if (count >= 50 && verified50 === null) verified50 = t;
      const record = { path: source.path, count: count - before, sha256: source.sha256, orderedIdentityDigest: sourceDigest.digest('hex') };
      sourceResults.push(record); if (timings.length < 15) timings.push({ path: source.path, bytes: source.bytes, parseMs: parsed.parseMs, wallMs: now() - sourceStart });
      await onSource(source, record);
    }
    d?.pragma('wal_checkpoint(TRUNCATE)');
    return { complete: true, candidateResolutionComplete: true, workspaceSearchComplete: false, coverageScope: 'provided candidates only; catalog/current workspace coverage is not established by this resolver', query: q, count, verifiedCount, scannedSources, candidateSources: sources.length, candidateBytes: sources.reduce((n, f) => n + f.bytes, 0), openStatMs, readMs, rawScanMs: now() - started, parseCallbackMs: parseMs, firstResultMs: first, first10Ms: first10, first50Ms: first50, firstVerifiedResultMs: verifiedFirst, verified10Ms: verified10, verified50Ms: verified50, fullMs: candidateMs + now() - started, maxRss, resourceUsage: process.resourceUsage(), spool: d ? { final: disk(name), walPeak, pageSize: 50, previewCodePoints: 256, ephemeral: true } : null, orderedIdentityDigest: digest.digest('hex'), sourceResults, examples, timings, errors };
  } catch (e) {
    if (d?.inTransaction) d.exec('ROLLBACK');
    const error = { code: e.message, count, verifiedCount, scannedSources, candidateSources: sources.length, complete: false, elapsedMs: now() - started, spool: d ? disk(name) : null };
    e.observation = error; throw e;
  } finally { d?.close(); }
}
