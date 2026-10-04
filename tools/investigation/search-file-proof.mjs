// 文件集合独立校验；只读取来源清单和三个调查库。
import fs from 'node:fs';
import path from 'node:path';
import { database, output, save, literalContains } from './search-lib.mjs';
const files=JSON.parse(fs.readFileSync(output('baseline.json'))).files;
const queries=JSON.parse(fs.readFileSync(output('queries.json'))).filter(q=>q.scope==='FILE');
const results=[];
for(const variant of ['A','B','C']) {
  const db=database(`${variant}.db`,true);
  try {
    const actual=db.prepare('SELECT id,path FROM files ORDER BY id').all();
    const catalogEqual=actual.length===files.length&&actual.every((f,i)=>f.id===i+1&&f.path===files[i].path);
    if(!catalogEqual)throw new Error('FILE_CATALOG_MISMATCH');
    for(const q of queries) {
      const expected=new Set(files.flatMap((f,i)=>(q.match==='exact'?f.path===q.query||path.posix.basename(f.path)===q.query:literalContains(f.path,q.query))?[i+1]:[]));
      const args=q.match==='exact'?[q.query,'%/'+q.query]:[q.query];
      const actualIds=db.prepare(`SELECT id FROM files WHERE ${q.match==='exact'?'path=? OR path LIKE ?':'instr(path,?)>0'}`).all(...args).map(r=>r.id);
      const falsePositive=actualIds.filter(id=>!expected.has(id)).length;
      const found=new Set(actualIds),falseNegative=[...expected].filter(id=>!found.has(id)).length;
      results.push({variant,label:q.label,catalogEqual,expected:expected.size,actual:found.size,falsePositive,falseNegative});
      if(falsePositive||falseNegative)throw new Error('FILE_LITERAL_MISMATCH');
    }
  } finally {db.close();}
}
save('file-proof.json',{files:files.length,results,passed:true});
