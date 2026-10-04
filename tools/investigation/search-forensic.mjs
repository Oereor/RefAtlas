// Full-dataset distinct field count includes census-only ambiguous sources, without inventing addresses.
import fs from 'node:fs';
import path from 'node:path';
import { dataRoot } from './common.mjs';
import { database,output,save,scan,exactKey } from './search-lib.mjs';
const c=database('C.db',true),b=JSON.parse(fs.readFileSync(output('build.json'))),extra=new Set(),extraByKind=new Map(),frequencies=new Map();
const exists=c.prepare('SELECT id FROM dictionary WHERE class=? AND kind=? AND exact_key=?');
try {
  for(const f of b.errors)await scan(path.join(dataRoot,f.path),{allowDuplicateKeys:true,onFact(f){const k=exactKey(f.kind,f.text),identity=JSON.stringify([f.class,f.kind,k]);frequencies.set(identity,(frequencies.get(identity)||0)+1);if(!exists.get(f.class,f.kind,k)){if(!extraByKind.has(f.kind))extraByKind.set(f.kind,new Set());extraByKind.get(f.kind).add(k);if(f.class==='FIELD')extra.add(k);}}});
  const valid=c.prepare("SELECT count(*) n FROM dictionary WHERE class='FIELD'").get().n;
  const fullRawDistinct=c.prepare('SELECT kind,count(*) addressable FROM dictionary GROUP BY kind').all().map(v=>({...v,additionalUnaddressable:extraByKind.get(v.kind)?.size||0,fullRaw:v.addressable+(extraByKind.get(v.kind)?.size||0)}));
  const stats=JSON.parse(fs.readFileSync(output('stats.json')));
  const validScopeTopWithFullRawCounts=stats.top.map(v=>({...v,unaddressableOccurrences:frequencies.get(JSON.stringify([v.class,v.kind,v.exact_key]))||0,fullRawOccurrences:v.occurrences+(frequencies.get(JSON.stringify([v.class,v.kind,v.exact_key]))||0)}));
  save('forensic.json',{addressableDistinctFields:valid,additionalUnaddressableDistinctFields:extra.size,fullRawDistinctFields:valid+extra.size,additionalFieldNames:[...extra].map(JSON.parse),fullRawDistinct,additionalStringKeys:[...(extraByKind.get('string')||[])],validScopeTopWithFullRawCounts,note:'top selection is from navigable scope; counts supplemented by all 15 ambiguous raw sources, not a newly ranked full raw top list',extraAddressesPublished:false});
  console.log(JSON.stringify({fullRawDistinctFields:valid+extra.size,additional:extra.size}));
}finally{c.close();}
