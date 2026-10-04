// Pure full-source literal fallback cost; no DB reads/inserts during the timed scan.
import fs from 'node:fs';
import path from 'node:path';
import { dataRoot } from './common.mjs';
import { output,save,scan,now } from './search-lib.mjs';
import { matches } from './search-reference.mjs';
const reference=JSON.parse(fs.readFileSync(output('reference.json'))),baseline=JSON.parse(fs.readFileSync(output('baseline.json'))),built=JSON.parse(fs.readFileSync(output('build.json')));
const hashBySource=new Map(built.sources.map(f=>[f.path,f.sha256]));
const selected=reference.queries.filter(q=>['chs-1','chs-3','numeric-substring','field-substring','feff'].includes(q.label));
const counts=selected.map(()=>0),unaddressable=selected.map(()=>0),started=now(),controller=new AbortController();process.on('SIGINT',()=>controller.abort());
let bytes=0,verifiedHashes=0;
for(const [i,file] of baseline.files.entries()){
  const local=selected.map(()=>0),r=await scan(path.join(dataRoot,file.path),{signal:controller.signal,allowDuplicateKeys:true,onFact(f){for(let j=0;j<selected.length;j++)if(matches(selected[j],f))local[j]++;}});
  if(r.stamp!==file.stamp)throw new Error('SOURCE_CHANGED');
  if(hashBySource.has(file.path)){if(hashBySource.get(file.path)!==r.sha256)throw new Error('SOURCE_HASH_CHANGED');verifiedHashes++;}
  local.forEach((n,j)=>{if(r.duplicateKeys)unaddressable[j]+=n;else counts[j]+=n;});bytes+=r.bytes;
  if(i%10000===0)console.log(JSON.stringify({stage:'fallback',sources:i+1,seconds:(now()-started)/1000}));
}
for(let j=0;j<selected.length;j++)if(counts[j]!==selected[j].count||unaddressable[j]!==selected[j].unaddressableRawMatches)throw new Error('FALLBACK_TRUTH_MISMATCH');
save('fallback.json',{wallMs:now()-started,queries:selected.map((q,j)=>({...q,count:counts[j],unaddressable:unaddressable[j]})),bytes,sources:baseline.files.length,verifiedHashes,completeSourceScan:true,workspaceCoverageComplete:false,method:'five literal probes share one full raw-source pass; not five independent single-query timings',resourceUsage:process.resourceUsage()});
console.log(JSON.stringify({complete:true,counts,seconds:(now()-started)/1000}));
