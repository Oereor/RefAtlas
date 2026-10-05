const {app,utilityProcess}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const root=path.join(__dirname,'artifacts/search-round2'), records=[],children=[],exits=[],pending=new Map(),ready=new Map();let seq=0;
app.setPath('userData',path.join(root,'lane-electron-profile'));
function launch(role){const p=utilityProcess.fork(path.join(__dirname,'search2-lane.cjs'),[role],{serviceName:'RefAtlas Round2 '+role});children.push(p);p.stdout?.on('data',b=>process.stdout.write(b));p.stderr?.on('data',b=>process.stderr.write(b));const initialized=new Promise((resolve,reject)=>{ready.set(p,{resolve,reject});});p.on('message',m=>{if(m.type==='ready'){ready.get(p).resolve(m);ready.delete(p);}else if(m.type==='failed'){const e=Error(m.error);pending.get(m.id)?.reject(e);ready.get(p)?.reject(e);}else if(m.type==='started')pending.get(m.id)?.startedResolve(m);else if(m.type==='result'){pending.get(m.id)?.resolve(m.result);} });p.on('exit',code=>{exits.push({role,pid:p.pid,exit:code,childClosed:true});if(code){for(const v of pending.values())v.reject(Error('UTILITY_EXIT_'+code));ready.get(p)?.reject(Error('UTILITY_EXIT_'+code));}});return{p,initialized};}
function request(p,type,kind){const id='r'+(++seq),t=performance.now();let startedResolve;const started=new Promise(r=>startedResolve=r);const promise=new Promise((resolve,reject)=>pending.set(id,{resolve:r=>{pending.delete(id);resolve({result:r,mainWallMs:performance.now()-t});},reject,startedResolve}));p.postMessage({id,type,kind});return{promise,started,id};}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const guard=setTimeout(()=>{for(const p of children)p.kill();app.exit(1);},10*60*1000);
app.whenReady().then(async()=>{
 const browser=launch('browser'),search=launch('search');const runtimes=await Promise.all([browser.initialized,search.initialized]);
 for(let i=0;i<3;i++)records.push({phase:'baseline',...(await request(browser.p,'browser').promise)});
 for(const mode of ['same-utility-independent-scheduler','worker-thread','dedicated-utility']){
  const p=mode==='dedicated-utility'?search.p:browser.p,task=request(p,mode==='worker-thread'?'worker-probe':'search','probe');await task.started;await delay(40);const control=request(p,'cancel-probe');const observed=await request(browser.p,'browser').promise;const cancellationAcknowledgement=await control.promise;const load=await task.promise;records.push({phase:'blocking-probe',mode,load,cancellationAcknowledgement,...observed});await delay(50);
 }
 for(const kind of ['build','selective-exact','selective-contains','broad']){
  const task=request(search.p,'search',kind);await task.started;await delay(40);const a=await request(browser.p,'browser').promise;await delay(100);const b=await request(browser.p,'browser').promise;const load=await task.promise;
  records.push({phase:'real-search-load',mode:'dedicated-utility',kind,load,suites:[a,b]});
 }
 for(const p of children)p.postMessage({type:'close',id:'close'});while(exits.length<children.length)await delay(20);clearTimeout(guard);
 if(exits.some(e=>e.exit!==0))throw Error('NONZERO_OWNED_CHILD');
 fs.writeFileSync(path.join(root,'lanes.json'),JSON.stringify({passed:true,records,runtimes,exits,searchConcurrency:1,ownedChildProcesses:0,scope:'hidden actual Electron Main + existing RawDataService in Browser Utility; private Search Utility; no Renderer or UI SLA',sameSchedulerProbe:'private independent Search task still shares Browser JS/native event loop',workerSharedFailureDomain:true,dedicatedProcessIsolation:true},null,2)+'\n');app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(guard);for(const p of children)p.kill();fs.writeFileSync(path.join(root,'lanes-failure.json'),JSON.stringify({error:e.stack,records,exits}));app.exit(1);});
