// Finite, serial expensive-stage supervisor; no automatic retries or production changes.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { output, save, now } from './search-lib.mjs';
const stages = [
  ['A',process.execPath,['--max-old-space-size=1024','search-variants.mjs','A']],
  ['C',process.execPath,['--max-old-space-size=1024','search-variants.mjs','C']],
  ['stats',process.execPath,['--max-old-space-size=1024','search-stats.mjs']],
  ['forensic',process.execPath,['search-forensic.mjs']],
  ['normalization',process.execPath,['--max-old-space-size=1024','search-normalization.mjs']],
  ['lifecycle',process.execPath,['--max-old-space-size=1024','search-lifecycle.mjs']],
  ['fallback',process.execPath,['--max-old-space-size=1024','search-fallback.mjs']],
  ['query-baseline',process.execPath,['--max-old-space-size=1024','search-query.mjs','baseline']],
  ['C-optimized',process.execPath,['--max-old-space-size=1024','search-query.mjs','C-optimized']],
  ['C-like',process.execPath,['--max-old-space-size=1024','search-query.mjs','C-like']],
  ['file-proof',process.execPath,['search-file-proof.mjs']],
  ['schema-parity',process.execPath,['search-parity.mjs']],
  ...['unicode61','trigram-all','trigram-string','trigram-large'].map(name=>[name,process.execPath,['--max-old-space-size=1024','search-query.mjs',name]]),
  ...['trigram-all','trigram-string','trigram-large'].map(name=>[name+'-ordered',process.execPath,['--max-old-space-size=1024','search-query.mjs',name,'--ordered-insert']]),
  ['runtime',path.resolve(import.meta.dirname,'../../node_modules/electron/dist/electron.exe'),['search-electron.cjs']],
  ['temp-indices',process.execPath,['search-temp.mjs','all']],
  ['fts-plans',process.execPath,['search-query.mjs','trigram-string','--ordered-insert','--plans-only']],
  ['post-fts-parity',process.execPath,['search-parity.mjs','--post-fts']],
  ['publication',process.execPath,['search-publication.mjs']],
  ['cancellation',process.execPath,['search-cancellation.mjs']],
  ['textmap',process.execPath,['search-textmap.mjs']],
  ['normalization-coverage',process.execPath,['search-normalization-coverage.mjs']],
  ['audit',process.execPath,['search-build.mjs','audit']],
];
const selected=process.argv.slice(2),outcomes=fs.existsSync(output('pipeline.json'))?JSON.parse(fs.readFileSync(output('pipeline.json'))):[];
if(selected.some(name=>!stages.some(s=>s[0]===name)))throw new Error('UNKNOWN_INVESTIGATION_STAGE');
let child;
process.on('SIGINT',()=>child?.kill('SIGINT'));
for(const [name,executable,args] of stages) {
  if(selected.length&&!selected.includes(name))continue;
  const started=now(),log=fs.openSync(output(`${name}.log`),'a');
  console.log(JSON.stringify({stage:name,state:'starting'}));
  try {
    await new Promise((resolve,reject)=>{
      child=spawn(executable,args,{cwd:import.meta.dirname,windowsHide:true,stdio:['ignore',log,log]});
      child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Stage ${name} exited ${code}`)));
    });
    outcomes.push({stage:name,exit:0,wallMs:now()-started});save('pipeline.json',outcomes);
  }catch(e){outcomes.push({stage:name,error:e.message,wallMs:now()-started});save('pipeline.json',outcomes);throw e;}
  finally{fs.closeSync(log);child=null;}
}
