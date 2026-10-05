// 当前 lane 共用 resolver 的终态/类型边界；仅自有小 fixture。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { root, save } from './search2-closeout.mjs';
import { scan } from './search-lib.mjs';
import { resolveOccurrences } from './search2-resolve.mjs';
import { clean } from './search2-closeout-work.mjs';
const name='closeout-boundaries.json',file=path.join(root,name),checks=[];
const q={scope:'VALUE',match:'exact',query:'6186714091647966180'},prefix='execution-lane-closeout/';
const options={sourceRoot:root,generation:'closeout-check',cacheGeneration:'frozen-check'};
const source=async()=>{const p=await scan(file);return{id:1,path:name,bytes:p.bytes,sha256:p.sha256,stamp:p.stamp};};
try{
 fs.writeFileSync(file,'{"n":6186714091647966180,"s":"x\\ufeffy","p":['+Array(40000).fill('0').join(',')+']}');
 const s=await source(),facts=[];
 const typed=await resolveOccurrences(q,[s],{...options,spool:false,onMatch:f=>facts.push({pointer:f.pointer,kind:f.kind,text:f.text})});
 assert.equal(typed.count,1);assert.deepEqual(facts,[{pointer:'/n',kind:'number',text:q.query}]);checks.push('unsafe integer numeric lexeme / Pointer retained');
 const string=await resolveOccurrences({scope:'STRING',match:'exact',query:'x\ufeffy'},[s],{...options,spool:false});assert.equal(string.count,1);checks.push('investigation FEFF semantic literal preserved; production unchanged');
 const controller=new AbortController();
 await assert.rejects(resolveOccurrences({scope:'NUMBER',match:'exact',query:'0'},[s],{...options,name:prefix+'check-cancel.db',signal:controller.signal,onChunk:async()=>controller.abort()}),e=>e.message==='CANCELLED'&&!e.observation.complete);
 const d=new Database(path.join(root,'check-cancel.db'),{readonly:true});try{assert.equal(d.prepare('SELECT state FROM spool_meta').get().state,'cancelled');assert.equal(d.pragma('quick_check')[0].quick_check,'ok');}finally{d.close();}checks.push('cancelled chunk spool cannot publish complete; reopen integrity ok');
 await assert.rejects(resolveOccurrences(q,[s],{...options,name:prefix+'check-change.db',onSource:async()=>fs.appendFileSync(file,' ')}),e=>e.message==='SOURCE_CHANGED_BEFORE_QUERY_COMPLETION'&&!e.observation.complete);checks.push('source changes after verified source cannot publish query complete');
 await assert.rejects(resolveOccurrences(q,[],{...options,name:prefix+'check-generation.db',currentCacheGeneration:()=> 'different'}),e=>e.message==='STALE_CACHE_GENERATION'&&!e.observation.complete);checks.push('empty frozen candidates with changed generation cannot publish complete');
 save('boundary-checks.json',{passed:true,checks,productionParserUnchanged:true});console.log(checks.join('\n'));
}finally{for(const n of['check-cancel.db','check-change.db','check-generation.db'])clean(n);if(fs.existsSync(file))fs.unlinkSync(file);}
