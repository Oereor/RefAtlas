// 全库索引重建补测 temp；子进程同步 SQL，监督进程独立观测自有目录。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { database,output,root,save,now,disk } from './search-lib.mjs';
const mode=process.argv[2]||'probe',dir=path.join(root,'sqlite-temp');
fs.mkdirSync(dir,{recursive:true});
if(mode==='probe') {
  const db=database('temp-probe.db');
  db.pragma("temp_store_directory='"+dir.replaceAll("'","''")+"'");
  console.log(JSON.stringify(db.pragma('temp_store_directory')));db.close();
} else if(mode==='child') {
  const variant=process.argv[3],db=database(variant+'.db');
  db.pragma("temp_store_directory='"+dir.replaceAll("'","''")+"'");
  const validated=db.pragma('temp_store_directory')[0]?.temp_store_directory===dir;
  if(!validated)throw new Error('TEMP_DIRECTORY_UNSUPPORTED');
  const began=now();
  const sql=variant==='A'?'DROP INDEX facts_exact;DROP INDEX facts_path;CREATE INDEX facts_exact ON facts(class,kind,exact_key,id);CREATE INDEX facts_path ON facts(path,id);':variant==='B'?'DROP INDEX facts_exact;DROP INDEX facts_file;CREATE INDEX facts_exact ON facts(class,kind,exact_key,id);CREATE INDEX facts_file ON facts(file_id,id);':'DROP INDEX facts_dict;DROP INDEX facts_file;CREATE INDEX facts_dict ON facts(dict_id,id);CREATE INDEX facts_file ON facts(file_id,id);';
  try {db.exec(sql);save('temp-'+variant+'-child.json',{variant,ms:now()-began,validatedTempDirectory:validated,preCheckpoint:disk(variant+'.db'),resourceUsage:process.resourceUsage()});db.pragma('wal_checkpoint(TRUNCATE)');}finally{db.close();}
} else if(mode==='all') {
  const measurements=[];
  for(const variant of ['A','B','C']) {
    let peak=0,maxFiles=0,observations=0,statFailures=0,dbHigh=0,walHigh=0;
    const sample=()=>{let bytes=0;const names=fs.readdirSync(dir);maxFiles=Math.max(maxFiles,names.length);for(const name of names)try{bytes+=fs.statSync(path.join(dir,name)).size;}catch{statFailures++;}peak=Math.max(peak,bytes);observations++;const d=disk(variant+'.db');dbHigh=Math.max(dbHigh,d.db);walHigh=Math.max(walHigh,d['-wal']);};
    const timer=setInterval(sample,100),started=now(),log=fs.openSync(output('temp-'+variant+'.log'),'a');
    try {await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--max-old-space-size=1024',import.meta.filename,'child',variant],{windowsHide:true,stdio:['ignore',log,log]});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('TEMP_CHILD_EXIT:'+code)));});sample();}
    finally {clearInterval(timer);fs.closeSync(log);}
    measurements.push({variant,wallMs:now()-started,tempPeakBytesObserved:peak,maxFiles,statFailures,observations,intervalMs:100,dbHighBytesObserved:dbHigh,walHighBytesObserved:walHigh,child:JSON.parse(fs.readFileSync(output('temp-'+variant+'-child.json')))});
    save('temp.json',{measurements,note:'full 83,513,357-row index recreation, separate from original build; logical file sizes, 100ms samples; transient peaks may be missed'});console.log(JSON.stringify(measurements.at(-1)));
  }
} else throw new Error('Unknown temp stage');
