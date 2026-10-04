// Existing single parser queue, same Utility lane; no production queue or protocol edits.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import { dataRoot } from './common.mjs';
import { output, save, database, scan, now, exactKey, guard } from './search-lib.mjs';

export async function runRuntime({nodeHarness=false}={}) {
  const { RawDataService } = createRequire(import.meta.url)(output('production.cjs'));
  const service = new RawDataService(), signal = new AbortController().signal;
  const context=new AsyncLocalStorage(), queueObservations=[];
  for(const name of ['parserQueue','metadataQueue']) {
    const queue=service[name]; if(!queue)continue;
    const original=queue.run.bind(queue);
    queue.run=(signal,action)=>{const submitted=now(),label=context.getStore();return original(signal,async()=>{const entered=now();try{return await action();}finally{if(label)queueObservations.push({...label,lane:name,queueMs:entered-submitted,executionMs:now()-entered});}});};
  }
  const opened = await service.execute({ kind: 'open', root: dataRoot }, signal), wid = opened.workspaceId;
  const avatar = { workspaceId: wid, relativePath: 'ExcelOutput/AvatarConfig.json' };
  const equipment = { workspaceId: wid, relativePath: 'ExcelOutput/EquipmentConfig.json' };
  const scalarSource = { workspaceId: wid, relativePath: 'TextMap/TextMapCHS.json' };
  const avatarInfo=await service.execute({ kind: 'info', source: avatar }, signal);
  await service.execute({ kind: 'read', address: { source: avatar, pointer: '' },expectedRevision:avatarInfo.revision }, signal);
  const scalarInfo=await service.execute({ kind: 'info', source: scalarSource }, signal);
  await service.execute({ kind: 'read', address: { source: scalarSource, pointer: '' },expectedRevision:scalarInfo.revision }, signal);
  // 从全量事实选择真实超显示段 scalar；生产 API 仍承担范围/内容读取。
  const selected=database('B.db',true);
  const scalarFile=selected.prepare('SELECT id FROM files WHERE path=?').get(scalarSource.relativePath);
  const scalarFact=selected.prepare("SELECT pointer_key,cp_length FROM facts WHERE file_id=? AND kind='string' ORDER BY cp_length DESC LIMIT 1").get(scalarFile.id);selected.close();
  const stringAddress={source:scalarSource,pointer:JSON.parse(scalarFact.pointer_key)};
  const observations = [];
  async function suite(phase, queuedBehindSource = null) {
    async function measure(operation, action) { const start = now(); try { const result = await context.run({phase,operation},action); observations.push({ phase, operation, ms: now() - start, queuedBehindSource, ok: true, bytes: Buffer.byteLength(JSON.stringify(result)) }); } catch (e) { observations.push({ phase, operation, ms: now() - start, queuedBehindSource, ok: false, code: e.code || e.message,details:e.details }); } }
    await Promise.all([
      measure('listDirectory', () => service.execute({ kind: 'directory', workspaceId: wid, directory: 'ExcelOutput', cursor: null, limit: 100 }, signal)),
      measure('getSourceInfo', () => service.execute({ kind: 'info', source: avatar }, signal)),
      measure('readNode', () => service.execute({ kind: 'read', address: { source: avatar, pointer: '/0/AvatarID' },expectedRevision:avatarInfo.revision }, signal)),
      measure('listNodeChildren', () => service.execute({ kind: 'children', address: { source: avatar, pointer: '/0' },expectedRevision:avatarInfo.revision, cursor: null, limit: 100 }, signal)),
      measure('readScalarSegment', () => service.execute({ kind: 'segment', address: stringAddress,expectedRevision:scalarInfo.revision, cursor: null, limit: 4096 }, signal)),
      measure('source activation', async () => { const info=await service.execute({ kind: 'info', source: equipment }, signal); return service.execute({ kind: 'read', address: { source: equipment, pointer: '' },expectedRevision:info.revision }, signal); }),
    ]);
  }
  for (let i = 0; i < 3; i++) await suite('baseline');
  const name = nodeHarness?'runtime-node.db':'runtime.db'; if (fs.existsSync(output(name))) throw new Error('OUTPUT_EXISTS');
  const db = database(name);
  db.exec('CREATE TABLE facts(id INTEGER PRIMARY KEY,file_id INTEGER,class TEXT,kind TEXT,pointer_key TEXT,exact_key TEXT,text TEXT); CREATE TABLE sources(id INTEGER PRIMARY KEY,path TEXT,hash TEXT,state TEXT);');
  const add = db.prepare('INSERT INTO facts(file_id,class,kind,pointer_key,exact_key,text) VALUES(?,?,?,?,?,?)');
  const files = JSON.parse(fs.readFileSync(output('baseline.json'))).files;
  const eventLoop = monitorEventLoopDelay({ resolution: 10 }); eventLoop.enable();
  const started = now(); let rows = 0, maxChunkSqlMs = 0, currentFile = null, triggered = false, pendingSuite = null, suites = 0;
  const errors=[];
  const timer = setInterval(() => { if (!pendingSuite && suites < 20) { suites++; pendingSuite = suite('under full indexing', currentFile).finally(() => { pendingSuite = null; }); } }, 15000);
  try {
    for (const [i, file] of files.entries()) {
      currentFile = file.path; guard(signal);
      db.prepare("INSERT INTO sources VALUES(?,?,NULL,'building')").run(i + 1, file.path);
      // The existing actual queue instance is inspected only in this private harness.
      try { await service.parserQueue.run(signal, async () => {
        let chunkSqlMs = 0;
        db.exec('BEGIN');
        const parsed = await scan(path.join(dataRoot, file.path), { signal,
          onFact(f) { const s = now(); add.run(i + 1, f.class, f.kind, JSON.stringify(f.pointer), exactKey(f.kind, f.text), f.text.isWellFormed() ? f.text : null); chunkSqlMs += now() - s; rows++; },
          async afterChunk() {
            const s = now(); db.exec('COMMIT'); chunkSqlMs += now() - s; maxChunkSqlMs = Math.max(maxChunkSqlMs, chunkSqlMs); chunkSqlMs = 0;
            if (file.bytes > 50 * 1024 ** 2 && !triggered && !pendingSuite) { triggered = true; suites++; pendingSuite = suite('large source head-of-line', currentFile).finally(() => { pendingSuite = null; }); }
            db.exec('BEGIN');
          },
        });
        db.prepare("UPDATE sources SET hash=?,state='ready' WHERE id=?").run(parsed.sha256, i + 1); db.exec('COMMIT');
      }); } catch(e) { if(db.inTransaction) db.exec('ROLLBACK'); db.prepare('DELETE FROM facts WHERE file_id=?').run(i+1); db.prepare("UPDATE sources SET state='failed' WHERE id=?").run(i+1); errors.push({path:file.path,code:e.message}); }
      if (i % 5000 === 0 || i === files.length - 1) console.log(JSON.stringify({ stage: 'runtime', sources: i + 1, rows, seconds: (now() - started) / 1000 }));
    }
    clearInterval(timer); if (pendingSuite) await pendingSuite;
    eventLoop.disable(); db.pragma('wal_checkpoint(TRUNCATE)');
    db.prepare('ATTACH DATABASE ? AS original').run(output('B.db'));
    const sourceHashProof=db.prepare("SELECT count(*) n FROM sources s JOIN original.files f ON f.id=s.id AND f.path=s.path WHERE s.state='ready' AND f.state='ready' AND s.hash=f.sha256").get().n;
    if(sourceHashProof!==db.prepare("SELECT count(*) n FROM original.files WHERE state='ready'").get().n)throw new Error('RUNTIME_SOURCE_HASH_MISMATCH');
    const result = { fullDatasetAttempted: true, complete:errors.length===0, errors, sourceRows: files.length, rowsAttempted: rows, rows:db.prepare('SELECT count(*) n FROM facts').get().n, wallMs: now() - started, observations, maxChunkSqlMs, eventLoop: { meanMs: eventLoop.mean / 1e6, maxMs: eventLoop.max / 1e6, p95Ms: eventLoop.percentile(95) / 1e6, p99Ms: eventLoop.percentile(99) / 1e6 }, runtime: process.versions, resourceUsage: process.resourceUsage(), scope: 'real RawDataService and its original RawScheduler(1); full source parse+SQLite insert in one Utility; no renderer/Preload/visible UI SLA' };
    if(result.rows!==db.prepare('SELECT count(*) n FROM original.facts').get().n)throw new Error('RUNTIME_OCCURRENCE_COUNT_MISMATCH');
    result.queueObservations=queueObservations;
    result.nodeHarness=nodeHarness;
    result.sourceHashMatches=sourceHashProof;
    result.segmentFixture={...stringAddress,codePoints:scalarFact.cp_length,requestedCodePoints:4096};
    save(nodeHarness?'runtime-node.json':'runtime.json', result); return result;
  } finally { clearInterval(timer); eventLoop.disable(); if (db.inTransaction) db.exec('ROLLBACK'); db.close(); service.dispose(); }
}
if(process.argv[1]===import.meta.filename)await runRuntime({nodeHarness:true});
