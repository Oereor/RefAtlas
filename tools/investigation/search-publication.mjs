// 同一自有 fixture 比较整源事务 replacement 与分块 staging publication。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { database, output, save, scan, now } from './search-lib.mjs';
const db=database('publication.db');
db.exec('DROP TABLE IF EXISTS sources; DROP TABLE IF EXISTS facts; CREATE TABLE sources(id INTEGER PRIMARY KEY,revision TEXT,state TEXT); CREATE TABLE facts(source_id INTEGER,revision TEXT,text TEXT); INSERT INTO sources VALUES(1,\'old\',\'ready\'); INSERT INTO facts VALUES(1,\'old\',\'old value\');');
const reader=database('publication.db',true);
const current=reader.prepare("SELECT count(*) n FROM facts f JOIN sources s ON s.id=f.source_id AND s.revision=f.revision WHERE s.state='ready' AND s.id=1");
const stable=reader.prepare("SELECT count(*) n FROM facts f JOIN sources s ON s.id=f.source_id AND s.revision=f.revision WHERE s.state='ready' AND s.id=2");
const add=db.prepare('INSERT INTO facts VALUES(1,?,?)'),outcomes=[];
const file=output('fixture-publication.json');
fs.writeFileSync(file,JSON.stringify(Array.from({length:10000},(_,i)=>({name:'测试'+i,value:i,enabled:true}))));
try {
  for(const policy of ['source replacement transaction','staging chunk publication'])for(const scenario of ['publish changed source','cancel changed source','cancel initial indexing']){
    const cancel=scenario.startsWith('cancel'),initial=scenario==='cancel initial indexing';
    db.exec("DELETE FROM facts; DELETE FROM sources; INSERT INTO sources VALUES(1,'old','ready'),(2,'stable','ready'); INSERT INTO facts VALUES(1,'old','old value'),(2,'stable','unchanged valid source');");
    if(initial)db.exec("DELETE FROM facts WHERE source_id=1;UPDATE sources SET revision=NULL,state='building' WHERE id=1");
    assert.equal(current.get().n,initial?0:1);assert.equal(stable.get().n,1);
    // 已知变更立即退出 current；不能依赖长事务中的未提交 UPDATE 隐藏旧事实。
    if(!initial)db.exec("UPDATE sources SET state='stale' WHERE id=1");
    const controller=new AbortController(),started=now();let rows=0,chunks=0,checks=0,cancelAt=null,maxChunkSqlMs=0,chunkSqlMs=0,state;
    const candidate=policy+'-'+cancel;
    db.exec('BEGIN');if(policy==='source replacement transaction')db.exec('DELETE FROM facts WHERE source_id=1');
    try {
      await scan(file,{signal:controller.signal,onFact(f){const t=now();add.run(candidate,JSON.stringify([f.class,f.kind,f.pointer,f.text]));chunkSqlMs+=now()-t;rows++;},async afterChunk(){
        chunks++;const t=now();if(policy==='staging chunk publication'){db.exec('COMMIT');db.exec('BEGIN');}chunkSqlMs+=now()-t;maxChunkSqlMs=Math.max(maxChunkSqlMs,chunkSqlMs);chunkSqlMs=0;
        assert.equal(current.get().n,0);assert.equal(stable.get().n,1);checks++;
        if(cancel&&chunks===2){cancelAt=now();controller.abort();}
      }});
      db.prepare('DELETE FROM facts WHERE source_id=1 AND revision!=?').run(candidate);
      db.prepare("UPDATE sources SET revision=?,state='ready' WHERE id=1").run(candidate);db.exec('COMMIT');state='ready';assert.equal(current.get().n,rows);
    }catch(error){assert.equal(error.message,'CANCELLED');if(db.inTransaction)db.exec('ROLLBACK');db.prepare('DELETE FROM facts WHERE revision=?').run(candidate);state='cancelled';assert.equal(current.get().n,0);}
    assert.equal(stable.get().n,1);
    outcomes.push({policy,scenario,state,fixtureBytes:fs.statSync(file).size,rowsAttempted:rows,currentRows:current.get().n,unaffectedSourceCurrentRows:stable.get().n,chunks,unpublishedExposureChecks:checks,wallMs:now()-started,maxChunkSqlMs,cancelRequestToStopMs:cancelAt===null?null:now()-cancelAt});
    db.exec("UPDATE sources SET state='stale' WHERE id=1");
    const native=createRequire(import.meta.url).resolve('better-sqlite3');
    const child=spawnSync(process.execPath,['--input-type=commonjs','-e',"const Database=require(process.argv[1]);const d=new Database(process.argv[2]);d.exec(\"BEGIN;DELETE FROM facts WHERE source_id=1;INSERT INTO facts VALUES(1,'crash','candidate');UPDATE sources SET revision='crash',state='ready' WHERE id=1;\");process.exit(99);",native,output('publication.db')],{windowsHide:true});
    assert.equal(child.status,99);assert.equal(current.get().n,0);assert.equal(stable.get().n,1);assert.equal(db.prepare("SELECT count(*) n FROM facts WHERE revision='crash'").get().n,0);
    outcomes.push({policy,scenario:'crash during final publication after '+scenario,childExit:99,currentRows:0,unaffectedSourceCurrentRows:1,uncommittedCandidateRows:0});
  }
  save('publication.json',{passed:true,outcomes,note:'same app-owned fixture; both policies first commit known stale exclusion; tiny fixture timings are not full-dataset incremental SLA'});
}finally{reader.close();if(db.inTransaction)db.exec('ROLLBACK');db.close();}
