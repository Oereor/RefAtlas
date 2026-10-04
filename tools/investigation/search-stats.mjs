// Complete DB aggregate facts, repetition and storage payload accounting.
import fs from 'node:fs';
import { database, save, now } from './search-lib.mjs';
const b = database('B.db',true), c = database('C.db',true), started=now();
try {
  const counts=b.prepare('SELECT class,kind,count(*) occurrences FROM facts GROUP BY class,kind').all();
  const dictionary=c.prepare('SELECT class,kind,count(*) distinctValues FROM dictionary GROUP BY class,kind').all();
  const top=c.prepare('SELECT d.class,d.kind,d.exact_key,count(*) occurrences FROM dictionary d JOIN facts f ON f.dict_id=d.id GROUP BY d.id ORDER BY occurrences DESC LIMIT 15').all();
  const fieldTop=c.prepare("SELECT d.exact_key,count(*) occurrences FROM dictionary d JOIN facts f ON f.dict_id=d.id WHERE d.class='FIELD' GROUP BY d.id ORDER BY occurrences DESC LIMIT 15").all();
  const payload=b.prepare('SELECT sum(length(CAST(f.pointer_key AS BLOB))) pointerBytes,sum(length(CAST(s.path AS BLOB))) repeatedPathBytes,sum(length(CAST(f.exact_key AS BLOB))) exactKeyBytes,sum(length(CAST(f.text AS BLOB))) searchTextBytes,sum(length(CAST(s.sha256 AS BLOB))) repeatedRevisionBytes FROM facts f JOIN files s ON s.id=f.file_id').get();
  const sourceContributions=b.prepare('SELECT s.path,count(*) rows,sum(length(CAST(f.pointer_key AS BLOB))+length(CAST(f.exact_key AS BLOB))+coalesce(length(CAST(f.text AS BLOB)),0)) textPayloadBytes FROM facts f JOIN files s ON s.id=f.file_id GROUP BY f.file_id ORDER BY rows DESC LIMIT 40').all();
  const fileCasing=b.prepare('SELECT lower(path) folded,count(*) variants FROM files GROUP BY lower(path) HAVING count(*)>1').all();
  const sizeAtStart={B:fs.statSync(new URL('./artifacts/search/B.db',import.meta.url)).size,C:fs.statSync(new URL('./artifacts/search/C.db',import.meta.url)).size};
  save('stats.json',{counts,dictionary,top,fieldTop,payload,sourceContributions,fileCasing,sizeAtStart,wallMs:now()-started,note:'per-source payload counts are logical UTF-8 bytes, not physical SQLite page attribution'});
  console.log(JSON.stringify({complete:true,counts,dictionary}));
} finally { b.close();c.close(); }
