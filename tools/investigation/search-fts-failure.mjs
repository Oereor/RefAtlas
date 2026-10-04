// 将候选失败导出为明确的不完整记录；不伪造未执行的查询证明。
import fs from 'node:fs';
import { database,output,save,disk } from './search-lib.mjs';
const mode=process.argv[2];
if(!['trigram-all','trigram-string','trigram-large'].includes(mode.replace('-plans','').replace('-ordered','')))throw new Error('UNKNOWN_CANDIDATE');
const pipelineStage=process.argv[3]||mode;
const pipeline=JSON.parse(fs.readFileSync(output('pipeline.json'))),failure=pipeline.findLast(r=>r.stage===pipelineStage&&r.error);
if(!failure)throw new Error('NO_FAILED_STAGE_EVIDENCE');
const db=database('C.db');
try {
  const last=db.prepare('SELECT count(*) rows,max(id) maxId FROM accelerator_docsize').get();
  const progress=fs.existsSync(output('query-'+mode+'-progress.json'))?JSON.parse(fs.readFileSync(output('query-'+mode+'-progress.json'))):[];
  const quickCheck=db.pragma('quick_check(1)');
  const partialQueryPlans=[];
  if(mode.endsWith('-plans')){
    const queries=JSON.parse(fs.readFileSync(output('reference.json'))).queries;
    for(const q of queries.filter(q=>q.scope!=='FILE'&&q.match==='contains')){
      const scope=q.scope==='FIELD'?"d.class='FIELD' AND d.kind='field'":q.scope==='VALUE'?"d.class='VALUE'":`d.class='VALUE' AND d.kind='${q.scope==='NUMBER'?'number':'string'}'`;
      const p=scope+' AND instr(d.text,?)>0',candidate=q.scope!=='FIELD'&&[...q.query].length>=3;
      const fallback=q.scope==='VALUE'?"af.class='VALUE'":`af.class='VALUE' AND af.kind='${q.scope==='NUMBER'?'number':'string'}'`;
      const ids=candidate?`SELECT f.id FROM accelerator a JOIN dictionary d ON d.id=a.rowid JOIN facts f ON f.dict_id=d.id WHERE accelerator MATCH ? AND ${p} UNION ALL SELECT f.id FROM accelerator_fallback af INDEXED BY fallback_scope CROSS JOIN dictionary d ON d.id=af.id CROSS JOIN facts f INDEXED BY facts_dict ON f.dict_id=d.id WHERE ${fallback} AND ${p}`:`SELECT f.id FROM dictionary d NOT INDEXED CROSS JOIN facts f INDEXED BY facts_dict ON f.dict_id=d.id WHERE ${p}`;
      const args=candidate?['"'+q.query.replaceAll('"','""')+'"',q.query,q.query]:[q.query];
      partialQueryPlans.push({label:q.label,scope:q.scope,query:q.query,sql:'SELECT count(*) n FROM ('+ids+')',plan:db.prepare('EXPLAIN QUERY PLAN SELECT count(*) n FROM ('+ids+')').all(...args),scopeCaveat:'quarantined partial accelerator; EXPLAIN only, no query execution or completeness proof'});
    }
  }
  save('query-'+mode+'-failure.json',{mode,status:'failed',complete:false,coverageComplete:false,failure,lastCommitted:last,quickCheck,partialQueryPlans,allocatedAtFailureRecovery:disk('C.db'),results:progress,buildProgress:fs.existsSync(output(mode+'-build-progress.json'))?JSON.parse(fs.readFileSync(output(mode+'-build-progress.json'))):null,unexecutedQueries:'not proven; full C literal path is independently validated',...(mode==='trigram-all'?{crashProbe:JSON.parse(fs.readFileSync(output('trigram-crash.json'))),smallRangeProbe:JSON.parse(fs.readFileSync(output('trigram-range.json')))}:{})});
} finally {db.close();}
