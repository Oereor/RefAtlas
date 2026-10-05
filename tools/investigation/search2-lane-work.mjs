// 私有执行通道负载，复用已验收查询与原 builder；不接入 public IPC。
import fs from 'node:fs';
import { db, load, inventory, progress, now, output, removeOwned } from './search2-lib.mjs';
import { candidates, resolveOccurrences } from './search2-resolve.mjs';
import { buildCandidate } from './search2-build.mjs';
const clean = name => { for(const s of ['', '-wal','-shm'])if(fs.existsSync(output(name+s)))removeOwned(name+s); };
export async function work(kind) {
 const start=now();
 if(kind==='probe') {
  // 固定同步 CPU + native SQLite 探针；独立 scheduler 不能解除同一 JS/native 调用阻塞。
  const d=db('lane-probe.db');try { let n=0;while(now()-start<300)n++;const native=now();const sum=d.prepare('WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<500000) SELECT sum(x) s FROM n').get().s;return {elapsedMs:now()-start,nativeMs:now()-native,sum,loopIterations:n}; }finally{d.close();clean('lane-probe.db');}
 }
 if(kind==='build') {
  const files=load('baseline.json').files.filter(f=>['ExcelOutput/AvatarConfig.json','TextMap/TextMapCHS.json','ExcelOutput/SpecialAvatarRelicMainValue.json'].includes(f.path));
  const result=await buildCandidate({name:'lane-build.db',files,pilot:true});clean('lane-build.db');clean('lane-build-staging.db');return {kind,wallMs:now()-start,files:files.length,memberships:result.memberships,realRawBuild:true,fullDataset:false};
 }
 const q=kind==='selective-exact'?{scope:'NUMBER',match:'exact',query:'100000001'}:kind==='selective-contains'?{scope:'STRING',match:'contains',query:'Monster_W1_Mecha'}:{scope:'VALUE',match:'exact',query:'true'};
 const d=db('s1.db',true);let c;try{c=await candidates(d,q,{dictionaryMode:'canonical-range'});}finally{d.close();}
 const controller=new AbortController(), name='lane-query.db';let result;
 try { result=await resolveOccurrences(q,c.sources,{name,signal:controller.signal,candidateMs:c.metrics.lookupMs,onChunk:async m=>{if(kind==='broad'&&m.count>=3000&&m.verifiedCount>=50)controller.abort();}});return {kind,metrics:c.metrics,resolution:{count:result.count,complete:result.complete,wallMs:now()-start}}; }
 catch(e){if(kind!=='broad'||e.message!=='CANCELLED')throw e;return {kind,metrics:c.metrics,resolution:{...e.observation,expectedCancel:true,wallMs:now()-start}};}
 finally{clean(name);}
}
