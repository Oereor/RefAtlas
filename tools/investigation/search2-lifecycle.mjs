// 自有小型 fixture：验证事务发布、重开和强制 hash 碰撞；不修改生产服务。
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { db, output, root, scan, typedKey, save, removeOwned, stamp, factMatches } from './search2-lib.mjs';
import { resolveOccurrences } from './search2-resolve.mjs';
const name='lifecycle.db', fixture='lifecycle-source.json', checks=[], cleanup=[];
const init = d => d.exec('CREATE TABLE files(id INTEGER PRIMARY KEY,hash TEXT,stamp TEXT,generation INTEGER);CREATE TABLE terms(id INTEGER PRIMARY KEY,k TEXT UNIQUE);CREATE TABLE memberships(term_id INTEGER,source_id INTEGER,PRIMARY KEY(term_id,source_id)) WITHOUT ROWID;CREATE INDEX reverse ON memberships(source_id,term_id)');
async function replace(d,id,file,{signal,beforePublish=()=>{}}={}) {
 const terms=new Set(), parsed=await scan(output(file),{signal,onFact:f=>terms.add(typedKey(f))});
 await beforePublish(); if(signal?.aborted)throw Error('CANCELLED');
 if(stamp(fs.statSync(output(file),{bigint:true}))!==parsed.stamp)throw Error('SOURCE_CHANGED_BEFORE_PUBLICATION');
 // Old ready generation remains visible until the whole replacement commits.
 d.transaction(()=>{ d.prepare('DELETE FROM memberships WHERE source_id=?').run(id); for(const k of terms){d.prepare('INSERT OR IGNORE INTO terms(k) VALUES(?)').run(k);const term=d.prepare('SELECT id FROM terms WHERE k=?').get(k);d.prepare('INSERT INTO memberships VALUES(?,?)').run(term.id,id);}d.prepare('INSERT INTO files VALUES(?,?,?,1) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash,stamp=excluded.stamp,generation=generation+1').run(id,parsed.sha256,parsed.stamp); })();
 return parsed;
}
if(process.argv.includes('--crash-before-publish')) {
 const d=db(name); await replace(d,1,fixture,{beforePublish:()=>{process.stdout.write('KNOWN_FIXTURE_EXIT_BEFORE_PUBLICATION\n');process.exit(23);}});throw Error('CRASH_NOT_TRIGGERED');
}
let d;
try {
 if(fs.existsSync(output(name)))throw Error('OUTPUT_EXISTS'); d=db(name);init(d);fs.writeFileSync(output(fixture),' {"needle":"first", "n":1001} ');
 await replace(d,1,fixture);const before=d.prepare('SELECT * FROM files').get(), original=d.prepare('SELECT t.k FROM terms t JOIN memberships m ON m.term_id=t.id ORDER BY t.k').all();assert.equal(before.generation,1);checks.push('add');
 fs.writeFileSync(output(fixture),'{"needle":"second","n":1001}');const cancel=new AbortController();await assert.rejects(replace(d,1,fixture,{signal:cancel.signal,beforePublish:()=>cancel.abort()}),/CANCELLED/);assert.deepEqual(d.prepare('SELECT * FROM files').get(),before);checks.push('cancel preserves previous ready generation');
 await assert.rejects(replace(d,1,fixture,{beforePublish:()=>fs.appendFileSync(output(fixture),' ')}),/SOURCE_CHANGED_BEFORE_PUBLICATION/);assert.deepEqual(d.prepare('SELECT * FROM files').get(),before);checks.push('change before publication rejects');
 d.close();d=null; const child=spawn(process.execPath,[import.meta.filename,'--crash-before-publish'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal,pid:child.pid,childClosed:true}));});assert.equal(exit.code,23);assert.match(log,/KNOWN_FIXTURE_EXIT/);
 d=db(name);assert.deepEqual(d.prepare('SELECT * FROM files').get(),before);assert.deepEqual(d.prepare('SELECT t.k FROM terms t JOIN memberships m ON m.term_id=t.id ORDER BY t.k').all(),original);checks.push('known controlled child exit before publication and reopen');
 await replace(d,1,fixture);assert.equal(d.prepare('SELECT generation FROM files').get().generation,2);const stale=d.prepare("SELECT count(*) n FROM terms WHERE NOT EXISTS(SELECT 1 FROM memberships WHERE term_id=terms.id)").get().n;assert.equal(stale,1);checks.push('replace atomically removes previous membership; orphan retained');
 d.transaction(()=>{d.prepare('DELETE FROM memberships WHERE source_id=1').run();d.prepare('DELETE FROM files WHERE id=1').run();})();assert.equal(d.prepare('SELECT count(*) n FROM memberships').get().n,0);d.exec('DELETE FROM terms WHERE NOT EXISTS(SELECT 1 FROM memberships WHERE term_id=terms.id)');assert.equal(d.prepare('SELECT count(*) n FROM terms').get().n,0);checks.push('delete plus lazy dictionary GC');
 assert.equal(d.pragma('quick_check',{simple:true}),'ok');d.close();d=null;
 // Actual SQLite union of deliberately colliding literals from distinct sources.
 const collision=db('collision.db');collision.exec('CREATE TABLE buckets(h BLOB PRIMARY KEY) WITHOUT ROWID;CREATE TABLE postings(h BLOB,source_id INTEGER,PRIMARY KEY(h,source_id)) WITHOUT ROWID');
 const h=Buffer.alloc(8), sources=[];
 for(const [i,value] of ['rare-a','rare-b','rare-a'].entries()){const file=`collision-${i}.json`;fs.writeFileSync(output(file),JSON.stringify({value}));const p=await scan(output(file),{onFact(){}});sources.push({id:i+1,path:file,sha256:p.sha256,stamp:p.stamp,bytes:fs.statSync(output(file)).size});collision.prepare('INSERT OR IGNORE INTO buckets VALUES(?)').run(h);collision.prepare('INSERT OR IGNORE INTO postings VALUES(?,?)').run(h,i+1);}
 const ids=collision.prepare('SELECT source_id FROM postings WHERE h=? ORDER BY source_id').all(h).map(p=>p.source_id);assert.deepEqual(ids,[1,2,3]);
 const h16=Buffer.alloc(16);collision.prepare('INSERT INTO buckets VALUES(?)').run(h16);for(const id of ids)collision.prepare('INSERT OR IGNORE INTO postings VALUES(?,?)').run(h16,id);assert.deepEqual(collision.prepare('SELECT source_id FROM postings WHERE h=? ORDER BY source_id').all(h16).map(p=>p.source_id),ids);
 const q={scope:'STRING',match:'exact',query:'rare-a'}, matches=[];
 const result=await resolveOccurrences(q,sources,{spool:false,sourceRoot:root,onMatch:(f,s)=>matches.push([s.id,f.pointer,f.kind,f.text])});assert.equal(result.count,2);assert.deepEqual(matches,[[1,'/value','string','rare-a'],[3,'/value','string','rare-a']]);
 collision.prepare('DELETE FROM postings WHERE source_id=?').run(1);assert.deepEqual(collision.prepare('SELECT source_id FROM postings WHERE h=? ORDER BY source_id').all(h).map(p=>p.source_id),[2,3]);collision.close();checks.push('forced collision unions all source candidates; raw verification removes false positives; deletion retains other sources');
 save('lifecycle.json',{passed:true,checks,controlledFault:{...exit,knownJavaScriptExit:true,nativeCrash:false},forcedCollision:{hashBytes:[8,16],bucketSources:ids,verifiedOccurrences:result.count,identities:matches},scope:'owned fixtures; transactions publish memberships only after complete source validation, no production implementation'});
} finally {
 d?.close();for(const base of [name,'collision.db'])for(const suffix of ['','-wal','-shm'])if(fs.existsSync(output(base+suffix)))cleanup.push(removeOwned(base+suffix));for(const file of [fixture,'collision-0.json','collision-1.json','collision-2.json'])if(fs.existsSync(output(file)))cleanup.push(removeOwned(file));save('lifecycle-cleanup.json',cleanup);
}
