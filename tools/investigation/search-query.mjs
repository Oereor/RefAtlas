// Full-corpus queries: ordered identity-set comparison, not count-only correctness.
import fs from 'node:fs';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { output, save, database, disk, now, exactKey, cpLength, guard } from './search-lib.mjs';

const mode = process.argv[2] || 'baseline', controller = new AbortController();
const orderedInsert=process.argv.includes('--ordered-insert'),plansOnly=process.argv.includes('--plans-only'),evidenceName=mode+(orderedInsert?'-ordered':'')+(plansOnly?'-plans':'');
process.on('SIGINT', () => controller.abort());
const reference = JSON.parse(fs.readFileSync(output('reference.json'))), queries = reference.queries;
const truth = database('truth.db', true);
const expected = truth.prepare('SELECT id FROM truth WHERE (mask & ?) != 0 ORDER BY id');
async function compare(rows, q) {
  const iterator = expected.iterate(1 << q.id); let e = iterator.next(), falseNegative = 0, falsePositive = 0, candidates = 0;
  for (const row of rows) {
    while (!e.done && e.value.id < row.id) { falseNegative++; e = iterator.next(); }
    if (!e.done && e.value.id === row.id) e = iterator.next(); else falsePositive++;
    if (++candidates % 10000 === 0) { guard(controller.signal); await yieldTurn(); }
  }
  while (!e.done) { falseNegative++; e = iterator.next(); }
  return { candidates, falseNegative, falsePositive, matchedReferenceCount: q.count };
}
function predicate(q, alias = '', legacy = false) {
  const col = name => alias + name;
  let scope = q.scope === 'FIELD' ? `${col('class')}='FIELD' AND ${col('kind')}='field'` : q.scope === 'VALUE' ? `${col('class')}='VALUE'` : `${col('class')}='VALUE' AND ${col('kind')}='${q.scope === 'NUMBER' ? 'number' : 'string'}'`;
  if(legacy)scope=q.scope==='FIELD'?`${col('class')}='FIELD'`:q.scope==='VALUE'?`${col('class')}='VALUE'`:`${col('kind')}='${q.scope==='NUMBER'?'number':'string'}'`;
  if (q.match === 'exact') {
    const kinds=q.scope==='FIELD'?['field']:q.scope==='STRING'?['string']:q.scope==='NUMBER'?['number']:['string','number','boolean','null'];
    return {sql:kinds.map(kind=>`(${col('class')}='${kind==='field'?'FIELD':'VALUE'}' AND ${col('kind')}='${kind}' AND ${col('exact_key')}=?)`).join(' OR '),args:kinds.map(kind=>kind==='string'||kind==='field'?JSON.stringify(q.query):q.query)};
  }
  return { sql: `${scope} AND instr(${col('text')},?)>0`, args: [q.query] };
}
async function countTimed(db, sql, args) {
  const times = []; let count;
  for (let i = 0; i < 3; i++) { guard(controller.signal);const s = now(); count = db.prepare(sql).get(...args).n; times.push(now() - s); await yieldTurn(); }
  return { count, firstConnectionObservationMs: times[0], warmMs: times.slice(1), caveat: 'OS cache not flushed; synchronous SQL count, not IPC/UI/cancellable planner latency' };
}
const results = [];
try {
  if(mode==='reset-accelerator') {
    const db=database('C.db');try{db.exec('DROP TABLE IF EXISTS accelerator;DROP TABLE IF EXISTS accelerator_fallback');db.pragma('wal_checkpoint(TRUNCATE)');save('accelerator-reset.json',{completedAt:new Date().toISOString(),tables:['accelerator','accelerator_fallback'],factsPreserved:true});}finally{db.close();}
  } else if (['baseline','C-optimized','C-like'].includes(mode)) {
    for (const variant of mode!=='baseline'?['C']:['B', 'A', 'C']) {
      const db = database(`${variant}.db`, true);
      try {
        for (const q of queries) {
          guard(controller.signal);
          if(mode==='C-like'&&(q.scope==='FILE'||q.match!=='contains'))continue;
          if (q.scope === 'FILE') {
            const legacyFile=mode==='baseline';
            const sql = q.match === 'exact' ? legacyFile?'path=? OR path LIKE ?':q.query.includes('/')?'path=?':'path=? OR substr(path,-length(?)-1)=\'/\'||? COLLATE BINARY' : 'instr(path,?)>0';
            const args = q.match === 'exact' ? legacyFile?[q.query, '%/' + q.query]:q.query.includes('/')?[q.query]:[q.query,q.query,q.query] : [q.query];
            const timing = await countTimed(db, `SELECT count(*) n FROM files WHERE ${sql}`, args);
            results.push({ variant, ...q, timing, fileSet: db.prepare(`SELECT id FROM files WHERE ${sql} ORDER BY id`).all(...args).map(x => x.id), groundTruthCountEqual: timing.count === q.count });
          } else {
            const p = predicate(q, variant === 'C' ? 'd.' : '',mode==='baseline');
            if(mode==='C-like') {p.sql=p.sql.replace('instr(d.text,?)>0',"d.text LIKE ? ESCAPE '\\'");p.args=['%'+q.query.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')+'%'];}
            const from = variant === 'C' ? mode!=='baseline'?`dictionary d ${q.match==='contains'?'NOT INDEXED':''} CROSS JOIN facts f INDEXED BY facts_dict ON f.dict_id=d.id`:'facts f JOIN dictionary d ON d.id=f.dict_id' : q.match === 'contains' ? 'facts NOT INDEXED' : 'facts';
            const id = variant === 'C' ? 'f.id' : 'id';
            const timing = await countTimed(db, `SELECT count(*) n FROM ${from} WHERE ${p.sql}`, p.args);
            const proof = await compare(db.prepare(`SELECT ${id} id FROM ${from} WHERE ${p.sql} ORDER BY ${id}`).iterate(...p.args), q);
            const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT ${id} FROM ${from} WHERE ${p.sql}`).all(...p.args);
            results.push({ variant, ...q, timing, proof, plan });
            if (mode!=='C-like'&&(proof.falseNegative || proof.falsePositive)) throw new Error('LITERAL_TRUTH_MISMATCH');
          }
          console.log(JSON.stringify({ stage: 'query', variant, label: q.label, result: results.at(-1).timing }));
          save(`query-${mode}-progress.json`, results);
        }
      } finally { db.close(); }
    }
    save(`query-${mode}.json`, results);
  } else if (['unicode61', 'trigram-all', 'trigram-string', 'trigram-large'].includes(mode)) {
    const db = database('C.db'), name = 'accelerator', before = disk('C.db'), started = now();
    db.prepare('ATTACH DATABASE ? AS reference').run(output('truth.db'));
    const usedBefore = db.pragma('page_count', { simple: true }) - db.pragma('freelist_count', { simple: true });
    const tokenizer = mode === 'unicode61' ? 'unicode61' : 'trigram case_sensitive 1';
    const eligible = (mode === 'trigram-all' ? "class='VALUE'" : mode === 'trigram-large' ? "class='VALUE' AND kind='string' AND cp_length>=256" : "class='VALUE' AND kind='string'") + ' AND text IS NOT NULL AND instr(text,char(0))=0';
    db.exec(`CREATE VIRTUAL TABLE ${name} USING fts5(text,content='',tokenize='${tokenizer}');`);
    db.exec(`CREATE TABLE accelerator_fallback(id INTEGER PRIMARY KEY,class TEXT,kind TEXT);INSERT INTO accelerator_fallback SELECT id,class,kind FROM dictionary ${orderedInsert?'NOT INDEXED':''} WHERE class='VALUE' AND NOT (${eligible}) ${orderedInsert?'ORDER BY id':''};CREATE INDEX fallback_scope ON accelerator_fallback(class,kind,id);`);
    const synchronousSetupMs=now()-started;
    const maxId = db.prepare('SELECT max(id) n FROM dictionary').get().n;
    let maxBuildBatchMs = 0, walHigh = 0, indexedDictionaryRows = 0;
    for (let after = 0; after < maxId; after += 25000) {
      guard(controller.signal); const s = now();
      const info = db.prepare(`INSERT INTO ${name}(rowid,text) SELECT id,text FROM dictionary ${orderedInsert?'NOT INDEXED':''} WHERE ${eligible} AND id>? AND id<=? ${orderedInsert?'ORDER BY id':''}`).run(after, after + 25000);
      indexedDictionaryRows += info.changes; maxBuildBatchMs = Math.max(maxBuildBatchMs, now() - s); walHigh = Math.max(walHigh, disk('C.db')['-wal']);
      save(evidenceName+'-build-progress.json',{after,through:after+25000,maxId,indexedDictionaryRows,orderedInsert,elapsedMs:now()-started,maxBuildBatchMs,walHighBytes:walHigh,rssBytes:process.memoryUsage().rss});
      if (after % 500000 === 0) console.log(JSON.stringify({ stage: mode, after, maxId, seconds: (now() - started) / 1000 }));
      await yieldTurn();
    }
    const buildMs = now() - started; db.pragma('wal_checkpoint(TRUNCATE)'); const withAccelerator = disk('C.db');
    const acceleratorUsedBytes = (db.pragma('page_count', { simple: true }) - db.pragma('freelist_count', { simple: true }) - usedBefore) * db.pragma('page_size', { simple: true });
    const eligibleOccurrences = db.prepare(`SELECT count(*) n FROM facts f JOIN dictionary d ON d.id=f.dict_id WHERE ${eligible.replaceAll(/\b(class|kind|text|cp_length)\b/g, 'd.$1')}`).get().n;
    for (const q of queries.filter(q => q.scope !== 'FILE' && q.match === 'contains')) {
      const p = predicate(q, 'd.'), quote = '"' + q.query.replaceAll('"', '""') + '"';
      const candidate = q.scope!=='FIELD' && q.query.isWellFormed() && !q.query.includes('\0') && (mode === 'unicode61' || cpLength(q.query) >= 3);
      let candidateProof = null, rawCandidateProof = null, candidateError = null;
      if (!plansOnly && candidate && q.scope !== 'FIELD' && (q.scope !== 'NUMBER' || mode === 'trigram-all')) {
        try {
          const scope=q.scope==='VALUE'?"d.class='VALUE'":`d.kind='${q.scope==='NUMBER'?'number':'string'}'`;
          rawCandidateProof=await compare(db.prepare(`SELECT f.id FROM ${name} a JOIN dictionary d ON d.id=a.rowid JOIN facts f ON f.dict_id=d.id WHERE ${name} MATCH ? AND ${scope} ORDER BY f.id`).iterate(quote),q);
          candidateProof = await compare(db.prepare(`SELECT f.id FROM ${name} a JOIN dictionary d ON d.id=a.rowid JOIN facts f ON f.dict_id=d.id WHERE ${name} MATCH ? AND ${p.sql} ORDER BY f.id`).iterate(quote, ...p.args), q);
        } catch (e) { candidateError = e.message; }
      }
      const covered = eligible.replaceAll(/\b(class|kind|text|cp_length)\b/g, 'd.$1');
      const eligibleReferenceCount=plansOnly?null:db.prepare(`SELECT count(*) n FROM reference.truth t JOIN facts f ON f.id=t.id JOIN dictionary d ON d.id=f.dict_id WHERE (t.mask & ?) != 0 AND ${covered}`).get(1<<q.id).n;
      const fallbackScope=q.scope==='VALUE'?"af.class='VALUE'":`af.class='VALUE' AND af.kind='${q.scope==='NUMBER'?'number':'string'}'`;
      const baseIds=`SELECT f.id id FROM dictionary d NOT INDEXED CROSS JOIN facts f INDEXED BY facts_dict ON f.dict_id=d.id WHERE ${p.sql}`;
      const idsSql = candidate && !candidateError ? `SELECT f.id id FROM ${name} a JOIN dictionary d ON d.id=a.rowid JOIN facts f ON f.dict_id=d.id WHERE ${name} MATCH ? AND ${p.sql} UNION ALL SELECT f.id id FROM accelerator_fallback af INDEXED BY fallback_scope CROSS JOIN dictionary d ON d.id=af.id CROSS JOIN facts f INDEXED BY facts_dict ON f.dict_id=d.id WHERE ${fallbackScope} AND ${p.sql}`:baseIds;
      const sql=`SELECT count(*) n FROM (${idsSql})`;
      const args = candidate && !candidateError ? [quote,...p.args,...p.args] : p.args;
      const queryPlan=db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args);
      if(plansOnly){results.push({mode,...q,queryPlan,sql,eligibility:eligible,parameters:args});continue;}
      const timing = await countTimed(db, sql, args);
      const setSql = idsSql.concat(' ORDER BY id');
      const proof = await compare(db.prepare(setSql).iterate(...args), q);
      results.push({ mode, ...q, queryPlan,rawCandidateProof,candidateProof, candidateError, eligibleReferenceCount,omissionsWithinAcceleratedCoverage:candidateProof?eligibleReferenceCount-candidateProof.candidates:null, fallback: !candidate ? 'all eligible+ineligible literal scan (short query)' : 'all ineligible dictionary contents', timing, proof });
      console.log(JSON.stringify({ stage: mode, label: q.label, timing, proof }));
      save(`query-${evidenceName}-progress.json`, results);
      if (mode !== 'unicode61' && (proof.falseNegative || proof.falsePositive)) throw new Error('ACCELERATOR_OMISSION');
    }
    save(`query-${evidenceName}.json`, { mode,orderedInsert,plansOnly, before, withAccelerator, acceleratorAllocatedBytes: withAccelerator.db - before.db, acceleratorUsedBytes, buildMs,synchronousSetupMs,scannedDictionaryIdRange:maxId,indexedDictionaryRows,insertPlan:db.prepare(`EXPLAIN QUERY PLAN SELECT id,text FROM dictionary ${orderedInsert?'NOT INDEXED':''} WHERE ${eligible} AND id>? AND id<=? ${orderedInsert?'ORDER BY id':''}`).all(6500000,6525000),eligibleOccurrences, maxBuildBatchMs, walHighBytes: walHigh, resourceUsage:process.resourceUsage(),results, note: plansOnly?'separate full FTS rebuild to capture query plans previously omitted; no new query timing or set proof; original successful full proof retained':'dictionary FTS, occurrence expansion via C facts; no duplicate FTS posting per occurrence; used bytes exclude reusable free pages; resourceUsage covers build plus query proof/counts' });
    db.exec(`DROP TABLE ${name};DROP TABLE accelerator_fallback`); db.pragma('wal_checkpoint(TRUNCATE)');
    // Pages are intentionally reused by next variant. Allocated delta must include free-page reuse.
    db.close();
  } else throw new Error('Unknown mode');
} finally { truth.close(); }
