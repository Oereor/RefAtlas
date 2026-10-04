// Independent Main->existing Utility architecture harness; hidden, no production IPC changes.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, utilityProcess } = require('electron');
const output = path.join(__dirname, 'artifacts', 'search');
app.setPath('userData', path.join(output, 'electron-profile'));
let child,nodeChild;
// B 全量构建提供资源基线；两个独立完整 harness 串行，45 分钟有限 guard。
const timer = setTimeout(() => { child?.kill();nodeChild?.kill(); app.exit(1); }, 45 * 60 * 1000);
app.whenReady().then(async () => {
  const nodePath=JSON.parse(fs.readFileSync(path.join(output,'baseline.json'))).environment.executable;
  const log=fs.openSync(path.join(output,'runtime-node.log'),'a');
  try {await new Promise((resolve,reject)=>{nodeChild=spawn(nodePath,['--max-old-space-size=1024',path.join(__dirname,'search-runtime.mjs')],{cwd:__dirname,windowsHide:true,stdio:['ignore',log,log]});nodeChild.on('error',reject);nodeChild.on('exit',code=>code===0?resolve():reject(new Error(`Node harness exited ${code}`)));});}
  finally {fs.closeSync(log);nodeChild=null;}
  console.log(JSON.stringify({stage:'runtime-node',state:'complete'}));
  child = utilityProcess.fork(path.join(__dirname, 'search-utility.cjs'), [], { serviceName: 'RefAtlas Search investigation' });
  child.stdout?.on('data',chunk=>process.stdout.write(chunk));
  child.stderr?.on('data',chunk=>process.stderr.write(chunk));
  child.on('message', message => { if (message.type === 'complete') { clearTimeout(timer); child.kill(); app.exit(0); } else if (message.type === 'failed') { console.error(message.error); clearTimeout(timer); child.kill(); app.exit(1); } });
  child.on('exit', code => { if (code) { clearTimeout(timer); app.exit(1); } });
}).catch(error => { console.error(error); clearTimeout(timer); app.exit(1); });
