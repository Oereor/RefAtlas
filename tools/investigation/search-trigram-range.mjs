// 崩溃批次在小型空 FTS 库的独立复现；不自动重跑全量失败候选。
import { database,save,output,now } from './search-lib.mjs';
const db=database('trigram-range.db'),started=now();
try {
  db.prepare('ATTACH DATABASE ? AS original').run(output('C.db'));
  db.exec("CREATE VIRTUAL TABLE probe USING fts5(text,content='',tokenize='trigram case_sensitive 1')");
  const range={after:6500000,through:6525000};
  const contents=db.prepare("SELECT count(*) rows,max(cp_length) maxCodePoints FROM original.dictionary WHERE class='VALUE' AND text IS NOT NULL AND id>? AND id<=?").get(range.after,range.through);
  db.prepare("INSERT INTO probe(rowid,text) SELECT id,text FROM original.dictionary WHERE class='VALUE' AND text IS NOT NULL AND id>? AND id<=?").run(range.after,range.through);
  save('trigram-range.json',{range,contents,passed:true,wallMs:now()-started,meaning:'same failed dictionary batch succeeds/fails in a new small index; does not establish full-corpus stability'});
  console.log(JSON.stringify({range,contents,passed:true,ms:now()-started}));
}finally{db.close();}
