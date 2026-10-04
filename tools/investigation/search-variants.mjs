// Complete corpus schema variants derived from B's lossless facts; parsing is explicitly reused.
import fs from 'node:fs';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { output, save, database, disk, now, guard } from './search-lib.mjs';

const mode = process.argv[2], name = `${mode}.db`, controller = new AbortController();
process.on('SIGINT', () => controller.abort());
if (!['A', 'C'].includes(mode)) throw new Error('A or C required');
if (fs.existsSync(output(name))) throw new Error('OUTPUT_EXISTS');
const db = database(name), started = now(), cpu = process.cpuUsage(), stages = [];
let maxBatchMs = 0, walHigh = 0, rssHigh = 0;
db.prepare('ATTACH DATABASE ? AS base').run(output('B.db'));
const maxId = db.prepare('SELECT max(id) n FROM base.facts').get().n;
const sourceRows = db.prepare('SELECT count(*) n FROM base.files WHERE state=\'ready\'').get().n;
db.exec('CREATE TABLE files AS SELECT * FROM base.files; CREATE UNIQUE INDEX files_id ON files(id);');
async function stage(label, sql) {
  const s = now();
  for (let after = 0; after < maxId; after += 100000) {
    guard(controller.signal); const t = now();
    db.prepare(sql).run(after, after + 100000);
    maxBatchMs = Math.max(maxBatchMs, now() - t);
    walHigh = Math.max(walHigh, disk(name)['-wal']); rssHigh = Math.max(rssHigh, process.memoryUsage().rss);
    if (after % 5000000 === 0) console.log(JSON.stringify({ stage: `${mode}:${label}`, after, maxId, elapsedSeconds: (now() - started) / 1000 }));
    await yieldTurn();
  }
  stages.push({ label, ms: now() - s, disk: disk(name) });
}
try {
  if (mode === 'A') {
    db.exec('CREATE TABLE facts(id INTEGER PRIMARY KEY,path TEXT,revision TEXT,class TEXT,kind TEXT,pointer_key TEXT,source_order INTEGER,exact_key TEXT,text TEXT,start INTEGER,end INTEGER,cp_length INTEGER);');
    await stage('insertion', `INSERT INTO facts SELECT b.id,f.path,f.sha256,b.class,b.kind,b.pointer_key,b.source_order,b.exact_key,b.text,b.start,b.end,b.cp_length FROM base.facts b JOIN base.files f ON f.id=b.file_id WHERE b.id>? AND b.id<=?`);
    const s = now(); db.exec('CREATE INDEX facts_exact ON facts(class,kind,exact_key,id); CREATE INDEX facts_path ON facts(path,id);'); stages.push({ label: 'indices', ms: now() - s, disk: disk(name) });
  } else {
    db.exec('CREATE TABLE dictionary(id INTEGER PRIMARY KEY,class TEXT NOT NULL,kind TEXT NOT NULL,exact_key TEXT NOT NULL,text TEXT,cp_length INTEGER,UNIQUE(class,kind,exact_key)); CREATE TABLE facts(id INTEGER PRIMARY KEY,file_id INTEGER,pointer_key TEXT,source_order INTEGER,dict_id INTEGER,start INTEGER,end INTEGER);');
    await stage('dictionary', 'INSERT OR IGNORE INTO dictionary(class,kind,exact_key,text,cp_length) SELECT class,kind,exact_key,text,cp_length FROM base.facts WHERE id>? AND id<=?');
    await stage('occurrences', `INSERT INTO facts SELECT b.id,b.file_id,b.pointer_key,b.source_order,d.id,b.start,b.end FROM base.facts b JOIN dictionary d ON d.class=b.class AND d.kind=b.kind AND d.exact_key=b.exact_key WHERE b.id>? AND b.id<=?`);
    const s = now(); db.exec('CREATE INDEX facts_dict ON facts(dict_id,id); CREATE INDEX facts_file ON facts(file_id,id);'); stages.push({ label: 'indices', ms: now() - s, disk: disk(name) });
  }
  const rows = db.prepare('SELECT count(*) n FROM facts').get().n;
  if (rows !== db.prepare('SELECT count(*) n FROM base.facts').get().n) throw new Error('ROW_COUNT_MISMATCH');
  walHigh = Math.max(walHigh, disk(name)['-wal']); db.pragma('wal_checkpoint(TRUNCATE)');
  save(`variant-${mode}.json`, { variant: mode, sourceRows, rows, dictionaryRows: mode === 'C' ? db.prepare('SELECT count(*) n FROM dictionary').get().n : null, stages, fullWallMs: now() - started, cpuMicros: process.cpuUsage(cpu), maxBatchMs, maxRssBytes: rssHigh, resourceUsage: process.resourceUsage(), walHighBytes: walHigh, final: disk(name), parsing: 'reuse full B source parse, no sampling/extrapolation', complete: true });
  console.log(JSON.stringify({ completed: mode, rows, disk: disk(name) }));
} finally { db.close(); }
