// benchmark 之后补齐终态 revision 检查，保留 benchmark 当时版本，不重跑全库计时。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {scan,root,output,save,removeOwned} from './search2-lib.mjs';
import {resolveOccurrences,readSpoolPage} from './search2-resolve.mjs';
const file='completion-fixture.json',options={sourceRoot:root,generation:'completion-check',cacheGeneration:'cache-one'},checks=[];
try{
 fs.writeFileSync(output(file),'{"n":1001}');const parsed=await scan(output(file)),source={id:1,path:file,sha256:parsed.sha256,stamp:parsed.stamp,bytes:parsed.bytes},q={scope:'NUMBER',match:'exact',query:'1001'};
 await assert.rejects(resolveOccurrences(q,[source],{...options,name:'completion-change.db',onSource:async()=>fs.appendFileSync(output(file),' ')}),e=>e.message==='SOURCE_CHANGED_BEFORE_QUERY_COMPLETION'&&e.observation.complete===false);
 assert.equal(readSpoolPage('completion-change.db',options).state,'failed');checks.push('change after source publication cannot publish query complete');
 let current='cache-two';await assert.rejects(resolveOccurrences(q,[],{...options,name:'completion-generation.db',currentCacheGeneration:()=>current}),e=>e.message==='STALE_CACHE_GENERATION'&&!e.observation.complete);checks.push('zero candidates with changed cache generation cannot complete');
 const fresh=await scan(output(file)),updated={...source,stamp:fresh.stamp,sha256:fresh.sha256};current='cache-one';
 await assert.rejects(resolveOccurrences(q,[updated],{...options,name:'completion-late-generation.db',currentCacheGeneration:()=>current,onSource:async()=>{current='cache-two';}}),e=>e.message==='STALE_CACHE_GENERATION'&&!e.observation.complete);checks.push('generation change after verified publication cannot complete');
 const complete=await resolveOccurrences(q,[updated],{...options,spool:false});assert(complete.complete&&complete.completionValidationMs>=0);checks.push('unchanged source completes candidate scope with separately timed final stat');
 save('controlled-retry/completion-checks.json',{passed:true,checks,measuredBenchmarkVersionPreserved:'controlled-retry/resolver-benchmark-version.mjs',timingNote:'old benchmark fullMs excludes this added final metadata/generation validation; dedicated lane uses current resolver',productionUnchanged:true});
}finally{for(const f of [file,...['completion-change.db','completion-generation.db','completion-late-generation.db'].flatMap(n=>[n,n+'-wal',n+'-shm'])])if(fs.existsSync(output(f)))removeOwned(f);}
