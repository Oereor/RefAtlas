// Serial conversion measurements; these are NOT direct-from-raw build evidence.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { db, output, save, now, safety, disk, removeOwned, progress, yieldTurn, load } from './search2-lib.mjs';
const observations = [], cleanup = [];
const source = db('s1.db',true);
const measure = d => ({ mainBytes: d.pragma('page_count', { simple: true }) * d.pragma('page_size', { simple: true }), objects: d.prepare('SELECT name,sum(pgsize) bytes,sum(payload) payload,sum(unused) unused FROM dbstat GROUP BY name').all() });
const erase = name => { for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(output(name + suffix))) cleanup.push(removeOwned(name + suffix)); };
const attach = d => d.prepare('ATTACH DATABASE ? AS original').run(output('s1.db'));
const schema = (d, count, hash = false) => d.exec(`CREATE TABLE files(id INTEGER PRIMARY KEY,path TEXT UNIQUE,stamp TEXT,sha256 TEXT,bytes INTEGER,state TEXT);
 CREATE TABLE terms(${hash ? 'id INTEGER PRIMARY KEY,h BLOB UNIQUE' : 'id INTEGER PRIMARY KEY,class TEXT,kind TEXT,exact_key TEXT,scan_text TEXT,df INTEGER,occurrences INTEGER,UNIQUE(class,kind,exact_key)'});
 CREATE TABLE memberships(term_id INTEGER,source_id INTEGER${count ? ',n INTEGER' : ''},PRIMARY KEY(term_id,source_id)) WITHOUT ROWID;
 INSERT INTO files SELECT * FROM original.files;`);
function finish(d, name) {
 d.exec('CREATE INDEX memberships_source ON memberships(source_id,term_id)'); d.pragma('wal_checkpoint(TRUNCATE)');
 assert.equal(d.pragma('quick_check', { simple: true }), 'ok'); return { ...measure(d), final: disk(name), memberships: d.prepare('SELECT count(*) n FROM memberships').get().n, terms: d.prepare('SELECT count(*) n FROM terms').get().n };
}
for (const count of [true, false]) {
 safety(10 * 1024 ** 3); const name = count ? 'space-count.db' : 'space-no-count.db', started = now();
 if (fs.existsSync(output(name))) throw Error('OUTPUT_EXISTS'); const d = db(name); let result;
 try { attach(d); schema(d, count); d.exec('INSERT INTO terms SELECT * FROM original.terms'); d.exec(`INSERT INTO memberships SELECT term_id,source_id${count ? ',n' : ''} FROM original.memberships ORDER BY term_id,source_id`); result = finish(d, name); assert.equal(result.memberships, 24321212); }
 finally { d.close(); }
 observations.push({ format: count ? 'S1-count-converted' : 'S1-no-count-converted', directFromRaw: false, wallMs: now() - started, ...result });
 save('space.json', { complete: false, observations, cleanup }); progress({ stage: 'space', format: observations.at(-1).format, bytes: result.mainBytes }); erase(name);
}
for (const bytes of [8, 16]) {
 safety(10 * 1024 ** 3); const name = `space-hash${bytes}.db`, started = now();
 if (fs.existsSync(output(name))) throw Error('OUTPUT_EXISTS'); const d = db(name); let result;
 try {
  attach(d); schema(d, false, true);
  d.exec('CREATE TABLE mapping(old_id INTEGER PRIMARY KEY,new_id INTEGER);');
  const add = d.prepare('INSERT OR IGNORE INTO terms(h) VALUES(?)'), get = d.prepare('SELECT id FROM terms WHERE h=?'), map = d.prepare('INSERT INTO mapping VALUES(?,?)');
  const rows = source.prepare('SELECT id,class,kind,exact_key FROM terms ORDER BY id').iterate(); let n = 0, collisions = 0;
  d.exec('BEGIN');
  try { for (const t of rows) { const h = createHash('sha256').update(JSON.stringify([t.class,t.kind,t.exact_key])).digest().subarray(0, bytes); if (!add.run(h).changes) collisions++; map.run(t.id,get.get(h).id); if (++n % 4096 === 0) { d.exec('COMMIT'); await yieldTurn(); d.exec('BEGIN'); if (n % (4096 * 128) === 0) progress({ stage: 'hash', bytes, terms: n }); } } d.exec('COMMIT'); } finally { rows.return?.(); }
  d.exec('INSERT OR IGNORE INTO memberships SELECT m.new_id,p.source_id FROM original.memberships p JOIN mapping m ON m.old_id=p.term_id ORDER BY m.new_id,p.source_id');
  // Mapping is measurement staging, never part of the delivered physical index.
  d.exec('DROP TABLE mapping'); d.exec('VACUUM'); const exact = finish(d, name);
  if (!collisions) assert.equal(exact.memberships,24321212);
  const lookupProof = [];
  for (const q of load('queries.json').queries.filter(q => q.match === 'exact')) {
   if (q.scope !== 'VALUE' && q.scope !== 'STRING' && q.scope !== 'NUMBER') continue;
   const kinds = q.scope === 'VALUE' ? ['string','number','boolean','null'] : [q.scope.toLowerCase()], ids = new Set(), original = new Set();
   for (const kind of kinds) {
    const key = kind === 'string' ? JSON.stringify(q.query) : q.query;
    const h = createHash('sha256').update(JSON.stringify(['VALUE',kind,key])).digest().subarray(0,bytes), term = get.get(h);
    if (term) for (const p of d.prepare("SELECT source_id FROM memberships p JOIN files f ON f.id=p.source_id WHERE term_id=? AND f.state='ready'").iterate(term.id)) ids.add(p.source_id);
    for (const p of d.prepare("SELECT p.source_id FROM original.memberships p JOIN original.terms t ON t.id=p.term_id JOIN original.files f ON f.id=p.source_id WHERE t.class='VALUE' AND t.kind=? AND t.exact_key=? AND f.state='ready'").iterate(kind,key)) original.add(p.source_id);
   }
   assert.deepEqual([...ids].sort((a,b)=>a-b),[...original].sort((a,b)=>a-b)); lookupProof.push({query:q.query,candidateSources:ids.size});
  }
  // Canonical dictionary preserves literal identity; hash bucket lookup index is required for incremental replacement.
  d.exec('CREATE TABLE dictionary(id INTEGER PRIMARY KEY,hash_id INTEGER,class TEXT,kind TEXT,exact_key TEXT)');
  const insert = d.prepare('INSERT INTO dictionary VALUES(?,?,?,?,?)'); const literalRows = source.prepare('SELECT id,class,kind,exact_key FROM terms ORDER BY id').iterate(); n = 0; d.exec('BEGIN');
  try { for (const t of literalRows) { const h=createHash('sha256').update(JSON.stringify([t.class,t.kind,t.exact_key])).digest().subarray(0,bytes); insert.run(t.id,get.get(h).id,t.class,t.kind,t.exact_key); if (++n%4096===0) { d.exec('COMMIT'); await yieldTurn(); d.exec('BEGIN'); } } d.exec('COMMIT'); } finally { literalRows.return?.(); }
  d.exec('CREATE INDEX dictionary_hash ON dictionary(hash_id,id)'); d.pragma('wal_checkpoint(TRUNCATE)'); assert.equal(d.pragma('quick_check',{simple:true}),'ok');
  result = { exactOnly: exact, combinedContains: measure(d), collisionsObserved: collisions, lookupProof, dictionaryTerms: n, stagingMappingDropped: true, directFromRaw: false, hashInput: 'SHA-256 UTF-8 JSON([factKind,rawKind,canonicalLiteral])', collisionRule: 'union source memberships; raw literal verify, never overwrite bucket' };
 } finally { if(d.inTransaction)d.exec('ROLLBACK'); d.close(); }
 observations.push({ format: `hash-${bytes}`, wallMs: now()-started, ...result }); save('space.json',{complete:false,observations,cleanup}); progress({stage:'space',format:`hash-${bytes}`,exactBytes:result.exactOnly.mainBytes,combinedBytes:result.combinedContains.mainBytes}); erase(name);
}
source.close(); const s = db('s1.db',true);
const tail = s.prepare('SELECT kind,count(*) terms,sum(df) memberships,sum(occurrences) occurrences FROM terms WHERE df>1000 GROUP BY kind').all(); s.close();
save('space.json',{complete:true,observations,cleanup,tail,limitations:['Conversions include creation time and required reverse indexes; not direct raw build evidence.','100ms named file sampling can miss short-lived or unnamed SQLite temp files.','No hash architecture accepted without direct raw construction and incremental full-scale validation.']});
