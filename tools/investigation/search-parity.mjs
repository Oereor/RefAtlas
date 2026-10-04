// A/C 全 occurrence 地址、类型、内容及 provenance 与已独立来源校验的 B 对照。
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { database,output,save,now,guard } from './search-lib.mjs';
const controller=new AbortController();process.on('SIGINT',()=>controller.abort());
const results=[];
const postFts=process.argv.includes('--post-fts');
const variants=postFts?['C']:['A','C'];
for(const variant of variants) {
  const db=database(variant+'.db',true),started=now();
  try {
    db.prepare('ATTACH DATABASE ? AS original').run(output('B.db'));
    const expected=db.prepare('SELECT count(*) n,max(id) maxId FROM original.facts').get();
    const from=variant==='A'?'facts f JOIN original.facts b ON b.id=f.id JOIN original.files s ON s.id=b.file_id':'facts f JOIN original.facts b ON b.id=f.id JOIN dictionary d ON d.id=f.dict_id';
    const condition=variant==='A'?'f.path IS NOT s.path OR f.revision IS NOT s.sha256 OR f.class IS NOT b.class OR f.kind IS NOT b.kind OR f.exact_key IS NOT b.exact_key OR f.text IS NOT b.text':'f.file_id IS NOT b.file_id OR d.class IS NOT b.class OR d.kind IS NOT b.kind OR d.exact_key IS NOT b.exact_key OR d.text IS NOT b.text';
    const sql=db.prepare(`SELECT count(*) compared,sum(CASE WHEN ${condition} OR f.pointer_key IS NOT b.pointer_key OR f.source_order IS NOT b.source_order OR f.start IS NOT b.start OR f.end IS NOT b.end THEN 1 ELSE 0 END) mismatches FROM ${from} WHERE f.id>? AND f.id<=?`);
    let compared=0,mismatches=0,maxBatchMs=0;
    for(let after=0;after<expected.maxId;after+=100000){guard(controller.signal);const t=now(),r=sql.get(after,after+100000);compared+=r.compared;mismatches+=r.mismatches||0;maxBatchMs=Math.max(maxBatchMs,now()-t);if(after%5000000===0)console.log(JSON.stringify({variant,compared,mismatches,seconds:(now()-started)/1000}));await yieldTurn();}
    const rows=db.prepare('SELECT count(*) n FROM facts').get().n;
    results.push({variant,compared,rows,expected:expected.n,mismatches,maxBatchMs,wallMs:now()-started,complete:compared===expected.n&&rows===expected.n&&mismatches===0});
    if(!results.at(-1).complete)throw new Error('FULL_SCHEMA_PARITY_FAILED');
    save(postFts?'schema-parity-post-fts.json':'schema-parity.json',{results,reference:'B full raw-source independent parser parity; SQL identities include type, pointer, value, byte range, source order and source path/revision',postFts,passed:results.length===variants.length});
  }finally{db.close();}
}
