// 交付检查：调查语法、受管格式、文档链接与生产变更边界；不运行无关 build/package。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { save,output } from './search-lib.mjs';
const app=path.resolve(import.meta.dirname,'../..'),checks=[];
function run(name,exe,args,cwd=app){const r=spawnSync(exe,args,{cwd,windowsHide:true,encoding:'utf8'});fs.writeFileSync(output('check-'+name+'.log'),(r.stdout||'')+(r.stderr||''));checks.push({name,exit:r.status,error:r.error?.message,outputTail:((r.stdout||'')+(r.stderr||'')).slice(-1600)});if(r.status!==0)throw new Error('CHECK_FAILED:'+name);}
try {
  for(const name of fs.readdirSync(import.meta.dirname).filter(n=>/^search-.*\.(mjs|cjs)$/.test(n)))run('syntax-'+name,process.execPath,['--check',path.join(import.meta.dirname,name)]);
  run('production-diff','git',['diff','--exit-code','--','src','package.json','package-lock.json','tools/investigation/package.json','tools/investigation/package-lock.json']);
  const status=spawnSync('git',['status','--porcelain=v1','--','src','package.json','package-lock.json','tools/investigation/package.json','tools/investigation/package-lock.json'],{cwd:app,encoding:'utf8',windowsHide:true});
  if(status.status!==0||status.stdout.trim())throw new Error('PRODUCTION_STATUS_CHANGED');
  checks.push({name:'production-status',exit:0,output:status.stdout});
  if(process.platform==='win32')run('format',process.env.ComSpec,['/d','/s','/c','npm.cmd run format:check']);else run('format','npm',['run','format:check']);
  run('docs',process.execPath,['scripts/check-docs.mjs']);
  run('diff-whitespace','git',['diff','--check']);
  save('checks.json',{checks,passed:true,executedAt:new Date().toISOString(),productionBuilds:0,scope:'investigation changes only; semantic/real-data gates in separate evidence'});
} catch(error){save('checks.json',{checks,passed:false,error:error.message});throw error;}
