import path from 'node:path';
import {spawn} from 'node:child_process';
import {output,save,safety} from './search2-lib.mjs';
const executable=path.resolve(import.meta.dirname,'../../node_modules/electron/dist/electron.exe');
const resources=safety(3*1024**3),env={...process.env,ELECTRON_NO_ATTACH_CONSOLE:'1'};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(executable,[path.join(import.meta.dirname,'search2-lanes-electron.cjs')],{windowsHide:true,stdio:['ignore','inherit','inherit'],env});
const result=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(exit,signal)=>resolve({exit,signal,pid:child.pid,childClosed:true}));});save('lanes-launch.json',{...result,resources});if(result.exit!==0)process.exitCode=1;
