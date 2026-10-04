// 对歧义来源新增distinct string补测既有归一化分组；不发布其地址。
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { database,output,save } from './search-lib.mjs';
const forensic=JSON.parse(fs.readFileSync(output('forensic.json'))),base=JSON.parse(fs.readFileSync(output('normalization.json')));
if(forensic.additionalUnaddressableDistinctFields)throw new Error('NEW_FIELDS_REQUIRE_NORMALIZATION_FOLLOW_UP');
const extra=forensic.additionalStringKeys.map(JSON.parse),r=spawnSync('python',['search-casefold.py'],{cwd:import.meta.dirname,windowsHide:true,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);
const fold=JSON.parse(r.stdout),digest=s=>createHash('sha256').update(Buffer.from(s,'utf16le')).digest(),unicodeFold=s=>[...s].map(ch=>fold.mapping[ch]??ch).join('');
const db=database('normalization-node.db',true),results=[];
try {
  for(const [policy,col,transform] of [['ASCII case-insensitive','a',s=>s.replace(/[A-Z]/g,ch=>ch.toLowerCase())],['Unicode full casefold','u',unicodeFold],['NFC','n',s=>s.normalize('NFC')]]){
    const groups=new Map();for(const text of extra){const key=digest(transform(text)).toString('hex');groups.set(key,(groups.get(key)||0)+1);}
    const original=base.results.find(v=>v.kind==='string'&&v.policy===policy),count=db.prepare(`SELECT count(*) n FROM norm WHERE kind='string' AND ${col}=?`);let addedGroups=0,addedValues=0;
    for(const [key,n] of groups){const old=count.get(Buffer.from(key,'hex')).n;if(old>1)addedValues+=n;else if(old+n>1){addedGroups++;addedValues+=old+n;}}
    results.push({kind:'string',policy,groups:original.groups+addedGroups,valuesInGroups:original.valuesInGroups+addedValues,addedGroups,addedValues});
  }
  save('normalization-coverage.json',{fullRawDistinct:forensic.fullRawDistinct,additionalStrings:extra.length,additionalNonNfc:extra.filter(s=>s.normalize('NFC')!==s).length,fieldResults:base.results.filter(v=>v.kind==='field'),stringResults:results,fullRawScope:true,groupKey:base.groupKey,unicodeCasefoldVersion:fold.unicodeVersion,nodeUnicodeVersion:process.versions.unicode,note:'indexed dictionary + all extra distinct strings from census-only ambiguous sources; statistical hash grouping; no ambiguous addresses published'});
}finally{db.close();}
