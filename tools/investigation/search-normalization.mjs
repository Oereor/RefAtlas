// Complete Unicode census with the validated Node SQLite driver; Python only emits casefold data.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { database,output,save,now,guard } from './search-lib.mjs';
const probe=spawnSync('python',['search-casefold.py'],{cwd:import.meta.dirname,encoding:'utf8',windowsHide:true});
if(probe.status!==0)throw new Error(probe.stderr);
const fold=JSON.parse(probe.stdout),c=database('C.db',true),db=database('normalization-node.db');
db.exec('CREATE TABLE norm(kind TEXT,id INTEGER,a BLOB,u BLOB,n BLOB);');
const insert=db.prepare('INSERT INTO norm VALUES(?,?,?,?,?)'),digest=s=>createHash('sha256').update(Buffer.from(s,'utf16le')).digest();
const unicodeFold=s=>{let folded='';for(const ch of s)folded+=fold.mapping[ch]??ch;return folded;};
const started=now(),nonNfc={field:0,string:0};let rows=0;
try {
  db.exec('BEGIN');
  for(const d of c.prepare("SELECT kind,id,exact_key FROM dictionary WHERE kind IN ('field','string')").iterate()){
    const text=JSON.parse(d.exact_key),ascii=text.replace(/[A-Z]/g,ch=>ch.toLowerCase()),nfc=text.normalize('NFC');
    if(nfc!==text)nonNfc[d.kind]++;
    insert.run(d.kind,d.id,digest(ascii),digest(unicodeFold(text)),digest(nfc));rows++;
    if(rows%100000===0){db.exec('COMMIT');guard();await yieldTurn();db.exec('BEGIN');console.log(JSON.stringify({stage:'normalization-node',rows,seconds:(now()-started)/1000}));}
  }
  db.exec('COMMIT');db.exec('CREATE INDEX norm_a ON norm(kind,a,id);CREATE INDEX norm_u ON norm(kind,u,id);CREATE INDEX norm_n ON norm(kind,n,id);');
  const results=[];
  for(const kind of ['field','string'])for(const [policy,col]of [['ASCII case-insensitive','a'],['Unicode full casefold','u'],['NFC','n']]){
    const groups=db.prepare(`SELECT count(*) groups,coalesce(sum(c),0) valuesInGroups FROM (SELECT count(*) c FROM norm WHERE kind=? GROUP BY ${col} HAVING count(*)>1)`).get(kind);
    const examples=[];
    for(const g of db.prepare(`SELECT ${col} folded,count(*) c FROM norm WHERE kind=? GROUP BY ${col} HAVING count(*)>1 ORDER BY c DESC LIMIT 5`).all(kind)){
      const ids=db.prepare(`SELECT id FROM norm WHERE kind=? AND ${col}=? LIMIT 4`).all(kind,g.folded).map(x=>x.id);
      const originals=ids.map(id=>JSON.parse(c.prepare('SELECT exact_key FROM dictionary WHERE id=?').get(id).exact_key));
      examples.push({variantCount:g.c,originals:originals.map(s=>s.slice(0,160))});
    }
    results.push({kind,policy,...groups,examples});
  }
  const paths=c.prepare('SELECT path FROM files').all().map(f=>f.path),pathVariants=[];
  for(const [policy,transform]of [['ASCII case-insensitive',s=>s.replace(/[A-Z]/g,ch=>ch.toLowerCase())],['Unicode full casefold',unicodeFold],['NFC',s=>s.normalize('NFC')]]){
    const groups=new Map();for(const p of paths){const k=transform(p);groups.set(k,(groups.get(k)||0)+1);}pathVariants.push({policy,groups:[...groups.values()].filter(n=>n>1).length,nonIdenticalTransforms:paths.filter(p=>transform(p)!==p).length});
  }
  db.pragma('wal_checkpoint(TRUNCATE)');save('normalization.json',{rows,nonNfcDistinct:nonNfc,results,pathVariants,wallMs:now()-started,python:fold.python,unicodeCasefoldVersion:fold.unicodeVersion,nodeUnicodeVersion:process.versions.unicode,driver:'better-sqlite3 13.0.3 / SQLite 3.53.4',groupKey:'SHA-256 normalized UTF-16LE; statistical grouping, not query truth proof',resourceUsage:process.resourceUsage()});
  console.log(JSON.stringify({complete:true,rows}));
}finally{if(db.inTransaction)db.exec('ROLLBACK');db.close();c.close();}
