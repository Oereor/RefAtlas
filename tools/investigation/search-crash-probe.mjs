// 原生崩溃后的自有缓存恢复检查；不推断根因。
import { database,save,now,disk } from './search-lib.mjs';
const db=database('C.db'),started=now(),before=disk('C.db');
try {
  const quickCheck=db.pragma('quick_check(1)');
  const published=db.prepare('SELECT max(id) maxId,count(*) rows FROM accelerator_docsize').get();
  const next=db.prepare("SELECT id,class,kind,cp_length FROM dictionary WHERE id>? ORDER BY id LIMIT 1").get(published.maxId);
  save('trigram-crash.json',{exitCode:3221225477,hex:'0xC0000005',before,afterRecovery:disk('C.db'),quickCheck,lastCommitted:published,nextDictionary:next,ms:now()-started,rootCause:'OPEN / REQUIRES FOLLOW-UP',coverageComplete:false,finalQueriesExecuted:false});
  console.log(JSON.stringify({quickCheck,published,next,ms:now()-started}));
} finally {db.close();}
