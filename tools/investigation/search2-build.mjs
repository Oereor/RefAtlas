// Source-deduplicated direct-from-raw builder and census. No persisted Pointer/range.
import fs from 'node:fs';
import path from 'node:path';
import { db, scan, inventory, audit, save, output, dataRoot, typedKey, exactKey, now, disk, progress, guard, safety, yieldTurn } from './search2-lib.mjs';

export async function buildCandidate({ name = 's1.db', files, signal, onSource = () => {}, pilot = false } = {}) {
  safety(); if (fs.existsSync(output(name))) throw Error('OUTPUT_EXISTS:' + name);
  const d = db(name), stagingName = name.replace('.db', '-staging.db'), stage = db(stagingName), started = now();
  d.exec(`CREATE TABLE files(id INTEGER PRIMARY KEY,path TEXT UNIQUE,stamp TEXT,sha256 TEXT,bytes INTEGER,state TEXT);
    CREATE TABLE terms(id INTEGER PRIMARY KEY,class TEXT,kind TEXT,exact_key TEXT,scan_text TEXT,df INTEGER DEFAULT 0,occurrences INTEGER DEFAULT 0,UNIQUE(class,kind,exact_key));
    CREATE TABLE memberships(term_id INTEGER,source_id INTEGER,n INTEGER,PRIMARY KEY(term_id,source_id)) WITHOUT ROWID;`);
  stage.exec('CREATE TABLE local(k TEXT PRIMARY KEY,class TEXT,kind TEXT,exact_key TEXT,scan_text TEXT,n INTEGER) WITHOUT ROWID;');
  const localAdd = stage.prepare('INSERT INTO local VALUES(?,?,?,?,?,?) ON CONFLICT(k) DO UPDATE SET n=n+excluded.n');
  const termGet = d.prepare('SELECT id FROM terms WHERE class=? AND kind=? AND exact_key=?');
  const termAdd = d.prepare('INSERT INTO terms(class,kind,exact_key,scan_text) VALUES(?,?,?,?)');
  const termUpdate = d.prepare('UPDATE terms SET df=df+1,occurrences=occurrences+? WHERE id=?');
  const post = d.prepare('INSERT INTO memberships VALUES(?,?,?)');
  const census = { rawOccurrences: {}, rawMemberships: {}, navigableMemberships: {}, sources: [], errors: [], spillSources: 0, peakDedupAccountedBytes: 0, pendingSourcePublication: true };
  let totalMemberships = 0, parseMs = 0, readMs = 0, insertMs = 0, maxRss = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      guard(signal); const f = files[i], id = i + 1, sourceStart = now();
      d.prepare("INSERT INTO files VALUES(?,?,?,NULL,?,'building')").run(id, f.path, f.stamp, f.bytes);
      stage.exec('DELETE FROM local');
      let map = new Map(), accounted = 0, spilled = false;
      const flush = stage.transaction(() => { for (const [key, t] of map) localAdd.run(key, t.class, t.kind, t.exact_key, t.scan_text, t.n); map.clear(); accounted = 0; });
      const counts = {}, occurrences = {}; let parsed;
      try {
        parsed = await scan(path.join(dataRoot, f.path), { signal, allowDuplicateKeys: true, onFact(fact) {
          occurrences[fact.kind] = (occurrences[fact.kind] || 0) + 1;
          const key = typedKey(fact), old = map.get(key);
          if (old) old.n++;
          else { const t = { class: fact.class, kind: fact.kind, exact_key: exactKey(fact.kind, fact.text), scan_text: fact.text.isWellFormed() ? fact.text : null, n: 1 }; map.set(key, t); accounted += Buffer.byteLength(key) + 2 * key.length + 160; }
          census.peakDedupAccountedBytes = Math.max(census.peakDedupAccountedBytes, accounted);
          if (accounted > 32 * 1024 ** 2) { flush(); if (!spilled) { census.spillSources++; spilled = true; } }
        }, afterChunk: async () => { guard(signal); maxRss = Math.max(maxRss, process.memoryUsage().rss); } });
        if (parsed.stamp !== f.stamp) throw Error('SOURCE_CHANGED_SINCE_INVENTORY');
        if (spilled) flush();
        const rows = spilled ? stage.prepare('SELECT * FROM local').iterate() : map.values();
        let batch = 0; d.exec('BEGIN');
        try {
          for (const t of rows) {
            guard(signal); counts[t.kind] = (counts[t.kind] || 0) + 1;
            const begin = now(); let term = termGet.get(t.class, t.kind, t.exact_key);
            if (!term) term = { id: Number(termAdd.run(t.class, t.kind, t.exact_key, t.scan_text).lastInsertRowid) };
            post.run(term.id, id, t.n); termUpdate.run(t.n, term.id); totalMemberships++;
            insertMs += now() - begin;
            if (++batch >= 4096) { d.exec('COMMIT'); progress({ stage: 'build', sources: i, memberships: totalMemberships }); d.exec('BEGIN'); batch = 0; await yieldTurn(); }
          }
          d.prepare('UPDATE files SET stamp=?,sha256=?,state=? WHERE id=?').run(parsed.stamp, parsed.sha256, parsed.duplicateKeys ? 'ambiguous' : 'ready', id);
          d.exec('COMMIT');
        } finally { rows.return?.(); }
        for (const [kind, n] of Object.entries(occurrences)) census.rawOccurrences[kind] = (census.rawOccurrences[kind] || 0) + n;
        for (const [kind, n] of Object.entries(counts)) { census.rawMemberships[kind] = (census.rawMemberships[kind] || 0) + n; if (!parsed.duplicateKeys) census.navigableMemberships[kind] = (census.navigableMemberships[kind] || 0) + n; }
        census.sources.push({ id, path: f.path, bytes: f.bytes, counts, occurrences, duplicateKeys: parsed.duplicateKeys, sha256: parsed.sha256, parseMs: parsed.parseMs, wallMs: now() - sourceStart, spilled });
        parseMs += parsed.parseMs; readMs += parsed.readMs; await onSource(f, parsed);
      } catch (e) {
        if (d.inTransaction) d.exec('ROLLBACK'); d.prepare("UPDATE files SET state='failed' WHERE id=?").run(id);
        census.errors.push({ path: f.path, code: e.message }); throw e;
      }
      map.clear(); stage.pragma('wal_checkpoint(TRUNCATE)');
      if (i % 2000 === 0 || i === files.length - 1) { safety(3 * 1024 ** 3); progress({ stage: 'build', sources: i + 1, memberships: totalMemberships, elapsedSeconds: (now() - started) / 1000 }); save(name + '-progress.json', { sources: i + 1, memberships: totalMemberships, errors: census.errors }); }
    }
    save(name + '-census.json', census);
    const beforeInverse = disk(name), indexStart = now();
    d.exec('CREATE INDEX memberships_source ON memberships(source_id,term_id);');
    const inverseMs = now() - indexStart;
    d.pragma('wal_checkpoint(TRUNCATE)'); stage.pragma('wal_checkpoint(TRUNCATE)');
    const integrity = d.pragma('quick_check');
    if (integrity[0].quick_check !== 'ok') throw Error('QUICK_CHECK_FAILED');
    const result = { directFromRaw: true, completed: true, files: files.length, memberships: totalMemberships, terms: d.prepare('SELECT count(*) n FROM terms').get().n, wallMs: now() - started, parseMs, readMs, insertMs, inverseMs, beforeInverse, final: disk(name), staging: disk(stagingName), maxRss, resourceUsage: process.resourceUsage(), integrity, pilot };
    save(name + '-build.json', result); return result;
  } finally { if (d.inTransaction) d.exec('ROLLBACK'); d.close(); stage.close(); }
}
if (process.argv[1] === import.meta.filename) {
  const pilot = process.argv.includes('--pilot'), controller = new AbortController(); process.on('SIGINT', () => controller.abort());
  const before = await audit(), files = await inventory();
  if (!pilot) save('baseline.json', { ...before, files });
  const chosen = pilot ? files.filter(f => ['ExcelOutput/AvatarConfig.json', 'TextMap/TextMapCHS.json', 'ExcelOutput/SpecialAvatarRelicMainValue.json'].includes(f.path)) : files;
  const result = await buildCandidate({ name: pilot ? 'pilot.db' : 's1.db', files: chosen, signal: controller.signal, pilot });
  console.log(JSON.stringify(result));
}
