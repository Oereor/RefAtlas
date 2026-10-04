// 失败后核对实际 FTS INSERT SELECT 访问顺序；不推断原生崩溃根因。
import { database,save } from './search-lib.mjs';
const db=database('C.db',true),results=[];
try {
  for(const eligible of ["class='VALUE'","class='VALUE' AND kind='string'","class='VALUE' AND kind='string' AND cp_length>=256"]){
    const where=eligible+' AND text IS NOT NULL AND instr(text,char(0))=0 AND id>? AND id<=?';
    for(const ordered of [false,true]){
      const sql=`SELECT id,text FROM dictionary ${ordered?'NOT INDEXED':''} WHERE ${where} ${ordered?'ORDER BY id':''}`;
      const plan=db.prepare('EXPLAIN QUERY PLAN '+sql).all(6500000,6525000),sample=db.prepare(sql+' LIMIT 5').all(6500000,6525000).map(r=>r.id);
      results.push({eligible,ordered,plan,sample});
    }
  }
  save('fts-insertion-plan.json',{results,scope:'same representative 25,000 id range, query plan plus real row order; causal relation to crash remains unproven'});console.log(JSON.stringify(results));
} finally {db.close();}
