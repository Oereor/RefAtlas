// 真正记录 timer 已执行的取消请求到循环停止；不把总耗时称为取消响应。
import assert from 'node:assert/strict';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { database,save,now } from './search-lib.mjs';
const outcomes=[],connections=[];
for(const variant of ['A','B','C'])for(let observation=0;observation<3;observation++){
  const started=now(),db=database(variant+'.db',true),openMs=now()-started;
  try {
    const from=variant==='C'?'dictionary d CROSS JOIN facts f INDEXED BY facts_dict ON f.dict_id=d.id':'facts d';
    const sql=db.prepare(`SELECT count(*) n FROM ${from} WHERE (d.class='VALUE' AND d.kind='number' AND d.exact_key=?) OR (d.class='VALUE' AND d.kind='string' AND d.exact_key=?)`),queryStarted=now();
    const count=sql.get('1001',JSON.stringify('1001')).n,firstQueryMs=now()-queryStarted;assert.equal(count,4065);
    connections.push({variant,observation,openIncludingPragmasMs:openMs,firstQueryMs,count,query:'VALUE Exact 1001',nativeModuleAlreadyLoaded:true,osCacheFlushed:false});
  }finally{db.close();}
}
for(const variant of ['B','C']){
  const db=database(variant+'.db',true);
  try {
    const table=variant==='B'?'facts':'dictionary';
    const max=db.prepare(`SELECT max(id) n FROM ${table}`).get().n;
    let starts=[{label:'start',id:0}];
    if(variant==='B'){
      const f=db.prepare("SELECT id FROM files WHERE path='TextMap/TextMapCHS.json'").get();
      starts.push({label:'late TextMap region',id:db.prepare('SELECT min(id) n FROM facts WHERE file_id=?').get(f.id).n-1});
    }
    const sql=db.prepare(`SELECT count(*) n FROM ${table} WHERE id>? AND id<=? AND instr(text,'拍')>0`);
    for(const start of starts)for(const batch of [1024,8192,32768]){
      const controller=new AbortController(),started=now();let requestAt=null,scanned=0,matched=0,maxSqlMs=0,after=start.id;
      const timer=setTimeout(()=>{requestAt=now();controller.abort();},20);
      while(after<max&&!controller.signal.aborted){const end=Math.min(max,after+batch),t=now();matched+=sql.get(after,end).n;maxSqlMs=Math.max(maxSqlMs,now()-t);scanned+=end-after;after=end;await yieldTurn();}
      const stopped=now();clearTimeout(timer);assert.notEqual(requestAt,null);assert.equal(controller.signal.aborted,true);
      outcomes.push({variant,label:start.label,startId:start.id,batch,scanned,matched,maxSqlMs,timerTargetMs:20,timerRequestObservedMs:requestAt-started,cancelRequestToStopMs:stopped-requestAt,totalMs:stopped-started,state:'cancelled',complete:false});
    }
  }finally{db.close();}
}
save('cancellation.json',{passed:true,outcomes,connections,note:'native SQL cannot be interrupted by same-thread timer; request is timestamped only when timer runs. maxSqlMs and timer delay expose synchronous blocking. Count-only diagnostic, not posting merge/IPC/UI production cancellation. Separate connection reopen observations include native open+pragmas and first query; OS cache not flushed.'});
