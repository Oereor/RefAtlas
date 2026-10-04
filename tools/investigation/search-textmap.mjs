// TextMap 全部语言/分片逻辑载荷；共享字典/SQLite 页不伪造逐源物理归属。
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { database,save,now } from './search-lib.mjs';
const db=database('B.db',true),started=now(),sources=[];
try {
  const files=db.prepare("SELECT id,path,bytes,state FROM files WHERE substr(path,1,8)='TextMap/' ORDER BY path").all();
  const sql=db.prepare('SELECT class,kind,count(*) occurrences,sum(length(CAST(text AS BLOB))) decodedUtf8Bytes,sum(length(CAST(exact_key AS BLOB))) exactKeyUtf8Bytes,sum(length(CAST(pointer_key AS BLOB))) pointerKeyUtf8Bytes FROM facts INDEXED BY facts_file WHERE file_id=? GROUP BY class,kind');
  for(const f of files){const began=now(),groups=sql.all(f.id);sources.push({...f,languageAndPartition:f.path.slice(8).replace(/^TextMap/,'').replace(/\.json$/,''),groups,measurementMs:now()-began,logicalPayloadBytes:groups.reduce((n,g)=>n+g.decodedUtf8Bytes+g.exactKeyUtf8Bytes+g.pointerKeyUtf8Bytes,0)});await yieldTurn();}
  save('textmap.json',{sources,wallMs:now()-started,resourceUsage:process.resourceUsage(),note:'B text + exact_key + pointer_key UTF-8 logical bytes; excludes row headers, indexes, pages, files metadata and C dictionary sharing. No physical per-source attribution.'});
}finally{db.close();}
