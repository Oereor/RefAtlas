// 只导出紧凑证据；缺失阶段会报错，不把进度文件当成成功结果。
import fs from 'node:fs';
import path from 'node:path';
import { output } from './search-lib.mjs';
const read=name=>JSON.parse(fs.readFileSync(output(name+'.json')));
const baseline=read('baseline'),build=read('build'),reference=read('reference');
const compactQuery=({fileSet,...q})=>({...q,...(fileSet?{fileResultCount:fileSet.length}:{})});
const queryNames=['baseline','C-optimized','C-like','unicode61','trigram-all','trigram-string','trigram-large','trigram-all-ordered','trigram-string-ordered','trigram-large-ordered'];
const queries=Object.fromEntries(queryNames.map(name=>{
  const value=fs.existsSync(output('query-'+name+'.json'))?read('query-'+name):read('query-'+name+'-failure');
  return [name,Array.isArray(value)?value.map(compactQuery):{...value,results:value.results.map(compactQuery)}];
}));
const evidence={
  status:'INVESTIGATION / AWAITING REVIEW; recommendations are not accepted architecture',
  generatedAt:new Date().toISOString(),applicationHead:'8e82ffc6339399d55b20d537f47d35a8f609ebb4',
  baseline:{repository:baseline.repository,environment:baseline.environment,fingerprints:baseline.fingerprints,inventoryMs:baseline.inventoryMs,files:baseline.files.length,rawBytes:baseline.files.reduce((n,f)=>n+f.bytes,0)},
  finalAudit:read('final-audit'),
  census:reference.census,sourceReference:{...reference,census:undefined},
  buildB:{...build.build,rowsAttempted:build.build.rows,rowsActual:read('variant-C').rows,errors:build.errors,complete:build.complete,budget:{chunkBytes:65536,maxTokenBytes:16777216,maxDepth:256,maxSourceMs:120000,maxRssBytes:2147483648},censusIncludesFailedPrefixes:true},
  variants:{A:read('variant-A'),C:read('variant-C')},tempIndexRecreation:read('temp'),schemaParity:read('schema-parity'),schemaParityPostFts:read('schema-parity-post-fts'),
  largestFiles:baseline.files.toSorted((a,b)=>b.bytes-a.bytes).slice(0,10),
  deepest:build.census.deepest,longestScalars:build.census.longest,maxPointerUtf8Bytes:build.sources.reduce((n,s)=>Math.max(n,s.maxPointerBytes),0),
  largestBuildSources:build.sources.toSorted((a,b)=>b.totalMs-a.totalMs).slice(0,15),
  textMap:build.sources.filter(f=>f.path.startsWith('TextMap/')),textMapPayload:read('textmap'),
  stats:read('stats'),forensic:read('forensic'),normalization:read('normalization'),normalizationFullRawScope:read('normalization-coverage'),
  fidelity:read('fidelity-corrections'),edges:read('edges'),fileProof:read('file-proof'),
  lifecycle:read('lifecycle'),publicationComparison:read('publication'),queryCancellation:read('cancellation'),fallback:read('fallback'),queries,ftsInsertionPlan:read('fts-insertion-plan'),ftsQueryPlans:read('query-trigram-string-ordered-plans'+(fs.existsSync(output('query-trigram-string-ordered-plans.json'))?'':'-failure')),runtimeNode:read('runtime-node'),runtime:read('runtime'),
  pipeline:read('pipeline'),
  limitations:[
    '15 duplicate-key sources are counted in raw census but have no unique navigable occurrence identity; workspace coverage is partial.',
    'A and C reuse full B parse; their materialization time is not a direct raw-source build timing.',
    'One base materialization per schema; index recreation and accelerator comparisons are separate stages. Three query counts per query; OS cache was never flushed.',
    'Build index creation and query count SQL are synchronous diagnostic calls, not cancellable production planners.',
    'Original build temp peak was not observed; separate full index recreation uses a controlled SQLite temp directory with 100ms external samples; brief transient peaks can be missed.',
    'Normalization grouping hashes are statistical evidence, not a lossless matching representation.',
    'Production tokenizer U+FEFF data loss was confirmed and remains unfixed.',
    'Python SQLite normalization, all three original trigram candidates, ordered trigram-all, and the ordered string-only plan rebuild crashed with 0xC0000005; root causes remain open. Failed candidates are explicitly incomplete.',
    'The initially successful FTS runs omitted persisted final query plans. The plan rebuild failed; partial accelerator EXPLAIN is not evidence of a complete FTS query path or stability.',
    'Utility harness is not renderer, IPC throughput, packaged, frame-rate, or macOS validation.',
  ],
};
if(!evidence.finalAudit.unchanged||!reference.complete||!reference.occurrenceParityAfterInvestigationCorrections||!evidence.edges.passed||!evidence.fileProof.passed||!evidence.lifecycle.passed||!evidence.schemaParity.passed||!evidence.schemaParityPostFts.passed||!evidence.publicationComparison.passed||!evidence.queryCancellation.passed)throw new Error('AUDIT_OR_SEMANTIC_GATE_FAILED');
if(evidence.tempIndexRecreation.measurements.length!==3)throw new Error('TEMP_STAGE_INCOMPLETE');
if(queries.baseline.length!==reference.queries.length*3||queries['C-optimized'].length!==reference.queries.length)throw new Error('LITERAL_QUERY_STAGE_INCOMPLETE');
for(const name of ['baseline','C-optimized'])for(const q of queries[name])if(q.proof&&(q.proof.falseNegative||q.proof.falsePositive))throw new Error('INDEX_QUERY_PROOF_FAILED');
for(const name of queryNames.filter(n=>n.startsWith('trigram-'))){
  const a=queries[name];
  if(a.status==='failed'){if(a.complete!==false||a.coverageComplete!==false||a.results.length!==0)throw new Error('INVALID_ACCELERATOR_FAILURE_MANIFEST');continue;}
  if(a.results.length!==reference.queries.filter(q=>q.scope!=='FILE'&&q.match==='contains').length)throw new Error('TRIGRAM_QUERY_STAGE_INCOMPLETE');
  for(const q of a.results)if(q.proof.falseNegative||q.proof.falsePositive)throw new Error('TRIGRAM_PROOF_FAILED');
}
const target=path.resolve(import.meta.dirname,'../../docs/investigations/evidence/phase-2-search-measurements.json');
fs.writeFileSync(target,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({target,bytes:fs.statSync(target).size,workspaceCoverageComplete:false,indexedScopeComplete:true}));
