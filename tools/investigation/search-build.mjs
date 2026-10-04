// Full-dataset investigation, not a product indexer.
import fs from 'node:fs';
import path from 'node:path';
import { dataRoot } from './common.mjs';
import { output, save, audit, inventory, database, disk, scan, now, cpLength, exactKey, histogram, guard } from './search-lib.mjs';

const signal = new AbortController();
process.on('SIGINT', () => signal.abort());
const mode = process.argv[2] || 'build';
if (mode === 'baseline') {
  const baseline = await audit(), started = now(), files = await inventory();
  save('baseline.json', { ...baseline, inventoryMs: now() - started, files });
  console.log(JSON.stringify({ sources: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) }));
} else if (mode === 'build' || mode === 'pilot') {
  const baseline = JSON.parse(fs.readFileSync(output('baseline.json')));
  const files = mode === 'pilot' ? baseline.files.filter(f => ['ExcelOutput/AvatarConfig.json', 'TextMap/TextMapCHS.json'].includes(f.path)) : baseline.files;
  const name = mode === 'pilot' ? 'pilot.db' : 'B.db';
  if (fs.existsSync(output(name))) throw new Error('OUTPUT_EXISTS: remove explicitly or select another stage');
  const db = database(name), started = now(), cpuStart = process.cpuUsage();
  db.exec(`CREATE TABLE files(id INTEGER PRIMARY KEY,path TEXT NOT NULL UNIQUE,stamp TEXT,sha256 TEXT,state TEXT NOT NULL,bytes INTEGER);
    CREATE TABLE facts(id INTEGER PRIMARY KEY,file_id INTEGER NOT NULL,class TEXT NOT NULL,kind TEXT NOT NULL,pointer_key TEXT NOT NULL,source_order INTEGER NOT NULL,exact_key TEXT NOT NULL,text TEXT,start INTEGER,end INTEGER,cp_length INTEGER NOT NULL);`);
  const addFile = db.prepare('INSERT INTO files(id,path,stamp,state,bytes) VALUES(?,?,?,\'building\',?)');
  const add = db.prepare('INSERT INTO facts(file_id,class,kind,pointer_key,source_order,exact_key,text,start,end,cp_length) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const publish = db.prepare('UPDATE files SET state=\'ready\',sha256=?,stamp=? WHERE id=?');
  const census = { files: files.length, rawBytes: files.reduce((n, f) => n + f.bytes, 0), types: {}, idLike: { number: 0, string: 0, rule: 'unsigned canonical decimal integer, 4..20 ASCII digits; appearance only' }, stringsWithUnpairedSurrogate: 0, fieldsWithUnpairedSurrogate: 0, nonNfc: 0, nul: 0, negativeZero: 0, decimal: 0, exponent: 0, containers: 0, serializedContainerBytes: 0, containerQueryExamples: ['拍', '1001'], containerMatches: [0, 0], scalarSerializedMatches: [0, 0], deepest: null, longest: [] };
  const lengths = Object.fromEntries(['field', 'string', 'number', 'path'].map(k => [k, histogram()]));
  let insertionMs = 0, parseMs = 0, readMs = 0, commitsMs = 0, maxBatchMs = 0, maxRss = 0, walHigh = 0, rows = 0;
  const sources = [], errors = [];
  const checkMetrics = () => { const rss = process.memoryUsage().rss; maxRss = Math.max(maxRss, rss); walHigh = Math.max(walHigh, disk(name)['-wal']); guard(signal.signal); };
  try {
    for (const [ordinal, file] of files.entries()) {
      guard(signal.signal); lengths.path.add(cpLength(file.path));
      const id = ordinal + 1, sourceStarted = now(), beforeInsert = insertionMs;
      addFile.run(id, file.path, file.stamp, file.bytes);
      let batchStarted = now(); db.exec('BEGIN');
      try {
        const metrics = await scan(path.join(dataRoot, file.path), {
          signal: signal.signal, containerQueries: census.containerQueryExamples,
          onFact(f) {
            const insertStarted = now(), key = exactKey(f.kind, f.text), length = cpLength(f.text);
            const wellFormed = f.text.isWellFormed();
            add.run(id, f.class, f.kind, JSON.stringify(f.pointer), f.order, key, wellFormed ? f.text : null, f.start, f.end, length);
            insertionMs += now() - insertStarted; rows++;
            census.types[f.kind] = (census.types[f.kind] || 0) + 1;
            lengths[f.kind]?.add(length);
            if (!wellFormed) census[f.kind === 'field' ? 'fieldsWithUnpairedSurrogate' : 'stringsWithUnpairedSurrogate']++;
            if (f.text.normalize('NFC') !== f.text) census.nonNfc++;
            if (f.text.includes('\0')) census.nul++;
            if ((f.kind === 'number' || f.kind === 'string') && /^[1-9][0-9]{3,19}$/.test(f.text)) census.idLike[f.kind]++;
            if (f.kind === 'number') { if (/^-0(?:\.0+)?(?:[eE][+-]?\d+)?$/.test(f.text)) census.negativeZero++; if (f.text.includes('.')) census.decimal++; if (/[eE]/.test(f.text)) census.exponent++; }
            if (!census.deepest || f.depth > census.deepest.depth) census.deepest = { path: file.path, pointer: f.pointer, depth: f.depth };
            if (f.kind === 'string' && (census.longest.length < 10 || length > census.longest.at(-1).length)) { census.longest.push({ path: file.path, pointer: f.pointer, length, utf8Bytes: Buffer.byteLength(f.text), preview: f.text.slice(0, 120) }); census.longest.sort((a, b) => b.length - a.length); census.longest.length = Math.min(10, census.longest.length); }
            if (f.class === 'VALUE') { const serialized = f.kind === 'string' ? JSON.stringify(f.text) : f.text; census.containerQueryExamples.forEach((q, i) => { if (serialized.includes(q)) census.scalarSerializedMatches[i]++; }); }
          },
          onContainer(c) { census.containers++; census.serializedContainerBytes += c.serializedBytes; for (const q of c.matchedQueries) census.containerMatches[q]++; },
          async afterChunk() { const s = now(); db.exec('COMMIT'); commitsMs += now() - s; maxBatchMs = Math.max(maxBatchMs, now() - batchStarted); checkMetrics(); db.exec('BEGIN'); batchStarted = now(); },
        });
        if (metrics.stamp !== file.stamp) throw new Error('SOURCE_CHANGED_SINCE_INVENTORY');
        publish.run(metrics.sha256, metrics.stamp, id); db.exec('COMMIT');
        const sourceInsertionMs = insertionMs - beforeInsert;
        parseMs += metrics.parseMs - sourceInsertionMs; readMs += metrics.readMs;
        sources.push({ id, path: file.path, ...metrics, insertMs: sourceInsertionMs, totalMs: now() - sourceStarted });
      } catch (error) {
        if (db.inTransaction) db.exec('ROLLBACK');
        db.prepare('UPDATE files SET state=\'failed\' WHERE id=?').run(id);
        db.prepare('DELETE FROM facts WHERE file_id=?').run(id);
        errors.push({ path: file.path, code: error.message });
        if (error.message === 'CANCELLED' || error.message.startsWith('RESOURCE_LIMIT_RSS')) throw error;
      }
      if (ordinal % 2000 === 0 || ordinal === files.length - 1) { console.log(JSON.stringify({ stage: mode, sources: ordinal + 1, total: files.length, rows, elapsedSeconds: (now() - started) / 1000, rssMiB: process.memoryUsage().rss / 1024 ** 2 })); save('build-progress.json', { completed: ordinal + 1, total: files.length, rows, errors }); }
    }
    const withoutIndices = disk(name), indexStarted = now();
    db.exec('CREATE INDEX facts_exact ON facts(class,kind,exact_key,id); CREATE INDEX facts_file ON facts(file_id,id);');
    const indexMs = now() - indexStarted, preCheckpoint = disk(name);
    db.pragma('wal_checkpoint(TRUNCATE)');
    const result = { stage: mode, census: { ...census, lengths: Object.fromEntries(Object.entries(lengths).map(([k, v]) => [k, v.result()])) }, errors, sources, build: { wallMs: now() - started, cpuMicros: process.cpuUsage(cpuStart), rows, readMs, parseWithoutInsertMs: parseMs, insertionMs, commitsMs, indexMs, maxBatchMs, maxRssBytes: maxRss, resourceUsage: process.resourceUsage(), walHighBytes: Math.max(walHigh, preCheckpoint['-wal']), withoutIndices, final: disk(name) }, complete: errors.length === 0 };
    save(mode === 'pilot' ? 'pilot.json' : 'build.json', result);
    console.log(JSON.stringify({ completed: mode, build: result.build, census: result.census.types, errors }));
  } finally { if (db.inTransaction) db.exec('ROLLBACK'); db.close(); }
} else if (mode === 'audit') {
  const final = await audit(), baseline = JSON.parse(fs.readFileSync(output('baseline.json')));
  const files=await inventory();
  final.allMetadataUnchanged=files.length===baseline.files.length&&files.every((f,i)=>f.path===baseline.files[i].path&&f.stamp===baseline.files[i].stamp);
  final.unchanged = JSON.stringify(final.repository) === JSON.stringify(baseline.repository) && JSON.stringify(final.fingerprints) === JSON.stringify(baseline.fingerprints);
  final.unchanged=final.unchanged&&final.allMetadataUnchanged;
  save('final-audit.json', final); console.log(JSON.stringify({ unchanged: final.unchanged }));
  if (!final.unchanged) process.exitCode = 1;
} else throw new Error('Unknown stage');
