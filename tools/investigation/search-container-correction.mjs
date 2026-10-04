// Complete container census: remove failed-source prefixes, add forensic full token observation.
// Permissive duplicate observation is census-only and never publishes navigable index facts.
import fs from 'node:fs';
import path from 'node:path';
import { dataRoot } from './common.mjs';
import { output, save, scan } from './search-lib.mjs';
const b=JSON.parse(fs.readFileSync(output('build.json'))),queries=b.census.containerQueryExamples;
const count={containers:b.census.containers,serializedBytes:b.census.serializedContainerBytes,queries,containerMatches:[...b.census.containerMatches],scalarMatches:[...b.census.scalarSerializedMatches]},corrections=[];
for(const file of b.errors) {
  const observe=async allowDuplicateKeys=>{const c={containers:0,serializedBytes:0,containerMatches:[0,0],scalarMatches:[0,0]};let metrics;try{metrics=await scan(path.join(dataRoot,file.path),{allowDuplicateKeys,containerQueries:queries,onFact(f){if(f.class==='VALUE'){const text=f.kind==='string'?JSON.stringify(f.text):f.text;queries.forEach((q,i)=>{if(text.includes(q))c.scalarMatches[i]++;});}},onContainer(f){c.containers++;c.serializedBytes+=f.serializedBytes;for(const i of f.matchedQueries)c.containerMatches[i]++;}});}catch(e){if(allowDuplicateKeys)throw e;}return{...c,duplicateKeys:metrics?.duplicateKeys};};
  const prefix=await observe(false),full=await observe(true);
  count.containers+=full.containers-prefix.containers;count.serializedBytes+=full.serializedBytes-prefix.serializedBytes;
  for(let i=0;i<2;i++){count.containerMatches[i]+=full.containerMatches[i]-prefix.containerMatches[i];count.scalarMatches[i]+=full.scalarMatches[i]-prefix.scalarMatches[i];}
  corrections.push({path:file.path,prefix,full});
}
save('containers.json',{...count,corrections,completeRawCensus:true,serialization:'compact lossless JSON (numeric lexemes preserved, ordered duplicate members retained); no container text materialization'});
console.log(JSON.stringify(count));
