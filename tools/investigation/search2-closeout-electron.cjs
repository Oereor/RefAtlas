// Main 只监督、发送私有有界消息和计时，不拥有 DB/parser。
const { app, utilityProcess } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, 'artifacts/search-round2/execution-lane-closeout');
const probesOnly = process.argv.includes('--probes-only');
const save = (n, v) => fs.writeFileSync(path.join(root, n), JSON.stringify(v, null, 2) + '\n');
app.setPath('userData', path.join(root, 'electron-profile'));
const endpoints = [], records = [], exits = [], runtimes = [], pending = new Map(), metrics = new Map(); let seq = 0, workerExits = [], fatal = null;
const delay = ms => new Promise(r => setTimeout(r, ms));
const operations = ['listDirectory','getSourceInfo','readNode','listNodeChildren','readScalarSegment','sourceActivation'];
function failAll(error) { fatal ||= error.stack || String(error); for (const p of pending.values()) { p.reject(error); p.startedReject(error); } }
function launch(role) {
  const p = utilityProcess.fork(path.join(__dirname, 'search2-closeout-lane.cjs'), [role], { serviceName: 'RefAtlas closeout ' + role });
  const endpoint = { p, role, expectedExit: 0, closed: false }; endpoints.push(endpoint);
  endpoint.ready = new Promise((resolve, reject) => { endpoint.readyResolve = resolve; endpoint.readyReject = reject; }); endpoint.ready.catch(() => {});
  p.stdout?.on('data', b => process.stdout.write(b)); p.stderr?.on('data', b => process.stderr.write(b));
  p.on('message', m => {
    const task = pending.get(m.id);
    if (m.type === 'ready') { endpoint.pid = m.pid; runtimes.push(m); endpoint.readyResolve(m); }
    else if (m.type === 'started') { task?.startedResolve(m); if (task) task.startedEvent = m; }
    else if (m.type === 'progress') { if (task) { task.progressCount++; task.phases[m.value.phase] = (task.phases[m.value.phase] || 0) + 1; if (task.progress.length < 10) task.progress.push(m.value); else { task.tail.push(m.value); if (task.tail.length > 40) task.tail.shift(); } if (m.value.phase === 'blocking-call-returned') task.nativeReturned = m.value; if (m.value.phase === 'resources-released') task.released = m.value; } }
    else if (m.type === 'cancel-ack' || m.type === 'cancel-forwarded') { task?.cancellation.push(m); }
    else if (m.type === 'result') { task?.resolve({ result: m.result, rpcWallMs: performance.now() - task.start, emittedAt: task.emittedAt, receivedAt: Date.now(), started: task.startedEvent, progressCount: task.progressCount, phases: task.phases, progress: task.progress, progressTail: task.tail, cancellation: task.cancellation, nativeReturned: task.nativeReturned, released: task.released }); pending.delete(m.id); }
    else if (m.type === 'failed') { task?.reject(Error(m.error)); pending.delete(m.id); }
    else if (m.type === 'worker-exit') { workerExits.push(m); if (m.code !== m.expected) failAll(Error('UNEXPLAINED_WORKER_EXIT_' + m.code)); }
    else if (m.type === 'fatal' || m.type === 'worker-error') failAll(Error(m.error));
  });
  p.on('exit', code => { endpoint.closed = true; endpoint.exit = code; exits.push({ role, pid: endpoint.pid, code, expected: endpoint.expectedExit, time: Date.now() }); if (code !== endpoint.expectedExit) { const e = Error('UNEXPLAINED_UTILITY_EXIT_' + code); endpoint.readyReject(e); failAll(e); } });
  return endpoint;
}
function request(endpoint, type, extra = {}) {
  const id = 'r' + (++seq); let resolve, reject, startedResolve, startedReject;
  const promise = new Promise((a,b) => { resolve=a;reject=b; }), started = new Promise((a,b) => { startedResolve=a;startedReject=b; }); promise.catch(() => {}); started.catch(() => {});
  const data = { id, type, ...extra }, task = { resolve,reject,startedResolve,startedReject,start:performance.now(),emittedAt:Date.now(),progress:[],tail:[],progressCount:0,phases:{},cancellation:[] };
  pending.set(id, task); endpoint.p.postMessage(data); return { id, promise, started, task, endpoint };
}
async function suite(browser) {
  const emittedAt = Date.now(); const responses = await Promise.all(operations.map(operation => request(browser, 'browser', { operation }).promise));
  for (const r of responses) if (r.result.observations.some(o => !o.ok)) throw Error('BROWSER_OPERATION_FAILED');
  return { emittedAt, endedAt: Date.now(), responses };
}
const cancel = task => { const emittedAt = Date.now(); task.endpoint.p.postMessage({ type: 'cancel', targetId: task.id, mode: task.mode, emittedAt }); return emittedAt; };
const samplers = setInterval(() => {
  for (const m of app.getAppMetrics()) { const old = metrics.get(m.pid) || { pid:m.pid,type:m.type,serviceName:m.serviceName,samples:0,maxWorkingSetKiB:0,maxPeakWorkingSetKiB:0,cpuPeakPercent:0 }; old.samples++; old.maxWorkingSetKiB=Math.max(old.maxWorkingSetKiB,m.memory?.workingSetSize||0); old.maxPeakWorkingSetKiB=Math.max(old.maxPeakWorkingSetKiB,m.memory?.peakWorkingSetSize||0); old.cpuPeakPercent=Math.max(old.cpuPeakPercent,m.cpu?.percentCPUUsage||0); metrics.set(m.pid,old); }
  save(probesOnly?'probes-checkpoint.json':'lane-checkpoint.json', { time: new Date().toISOString(), records: records.length, pending: [...pending.keys()], exits, metrics: [...metrics.values()] });
}, 250);
const guard = setTimeout(() => { failAll(Error('SUPERVISOR_TIMEOUT')); for (const e of endpoints) if (!e.closed) e.p.kill(); app.exit(1); }, 10 * 60 * 1000);
app.whenReady().then(async () => {
  let browser = launch('browser'), search = launch('search'); await Promise.all([browser.ready,search.ready]);
  for (let n=0;n<3;n++) { await request(browser,'reset-monitor').promise; records.push({ phase:'baseline',run:n, ...(await suite(browser)) }); }
  for (const mode of ['same-thread','worker','dedicated-utility']) {
    const endpoint = mode === 'dedicated-utility' ? search : browser;
    if (mode === 'worker') records.push({ phase:'worker-startup', ...(await request(browser,'prepare-worker').promise) });
    for (const kind of ['js-probe','native-probe']) {
      await request(browser,'reset-monitor').promise;
      // monitorEventLoopDelay 必须先取得至少一个 tick，否则首个同步阻塞可能未被 histogram 捕获。
      await delay(30);
      const task = request(endpoint,'search',{kind,mode:mode==='worker'?'worker':'local'}); task.mode=mode==='worker'?'worker':'local'; await task.started; await delay(40);
      const cancelEmittedAt=cancel(task), observed=await suite(browser), load=await task.promise;
      records.push({phase:'blocking-probe',mode,kind,cancelEmittedAt,load,browser:observed});
    }
  }
  records.push({phase:'candidate-gate',mode:'same-thread',decision:'eliminated after fixed sync probes; inspect measured RPC/event-loop delay',matrixExecuted:false});
  if(probesOnly){
    for(const e of endpoints)e.p.postMessage({type:'close'});
    while(endpoints.some(e=>!e.closed)){if(fatal)throw Error(fatal);await delay(20);}
    clearTimeout(guard);clearInterval(samplers);
    save('probes-corrected.json',{passed:true,records,runtimes,exits,workerExits,metrics:[...metrics.values()],monitorWarmupMs:30,reason:'initial histogram may miss first blocking interval; corrected probes only, full matrix not repeated'});app.exit(0);return;
  }
  for (const mode of ['worker','dedicated-utility']) {
    const endpoint=mode==='worker'?browser:search;
    // 同一 Browser 所有权和 cache 状态；各候选开始前单独取得基线。
    await request(browser,'reset-monitor').promise; records.push({phase:'candidate-baseline',mode,...(await suite(browser))});
    for (const kind of ['build','selective-exact','selective-contains','broad']) for (const run of ['first observed','repeat observed']) {
      if(fatal)throw Error(fatal); await request(browser,'reset-monitor').promise;
      const task=request(endpoint,'search',{kind,mode:mode==='worker'?'worker':'local',windowMs:5000});await task.started;await delay(40);
      const a=await suite(browser);await delay(100);const b=await suite(browser);const load=await task.promise;
      const overlap=[a,b].map(s=>s.emittedAt<load.result.endedAt&&s.endedAt>load.result.beganAt);
      if(overlap.some(x=>!x))throw Error('MISSING_REAL_OVERLAP');
      records.push({phase:'matrix',mode,kind,run,load,suites:[a,b],overlap});save('lane-records-progress.json',{records,runtimes,exits});
    }
    for(const kind of ['build','broad']){
      await request(browser,'reset-monitor').promise;const task=request(endpoint,'search',{kind,mode:mode==='worker'?'worker':'local',windowMs:5000});task.mode=mode==='worker'?'worker':'local';await task.started;await delay(100);const cancelEmittedAt=cancel(task);const observed=await suite(browser);const load=await task.promise;
      if(!load.result.cancelled||load.result.complete!==false||!load.released)throw Error('CANCELLATION_NOT_COMPLETED');
      records.push({phase:'cooperative-cancellation',mode,kind,cancelEmittedAt,load,browser:observed});
    }
  }
  const failureWork=(await import('./search2-closeout-work.mjs')).recoverFailureFiles;
  // 受控 JS process.exit 是已知终态，不制造 native crash。
  const workerMarker=workerExits.length, failedWorker=request(browser,'search',{kind:'build',mode:'worker',failureMode:'exit-at-batch'});await failedWorker.started;
  while(workerExits.length===workerMarker){if(fatal)throw Error(fatal);await delay(20);}pending.delete(failedWorker.id);
  const workerFailure=workerExits.at(-1), workerRecovery=failureWork(browser.p.pid), workerBrowser=await suite(browser);
  const workerRestart=await request(browser,'prepare-worker').promise;
  records.push({phase:'controlled-failure',mode:'worker',exit:workerFailure,recovery:workerRecovery,browser:workerBrowser,explicitRestart:workerRestart,sharedNativeFailureDomain:true});
  search.expectedExit=23;const failedUtility=request(search,'search',{kind:'build',mode:'local',failureMode:'exit-at-batch'});await failedUtility.started;
  while(!search.closed){if(fatal)throw Error(fatal);await delay(20);}pending.delete(failedUtility.id);
  const utilityRecovery=failureWork(search.pid), utilityBrowser=await suite(browser);search=launch('search');await search.ready;
  records.push({phase:'controlled-failure',mode:'dedicated-utility',exit:exits.find(e=>e.code===23),recovery:utilityRecovery,browser:utilityBrowser,explicitRestart:true});
  for(const e of endpoints)if(!e.closed)e.p.postMessage({type:'close'});
  while(endpoints.some(e=>!e.closed)){if(fatal)throw Error(fatal);await delay(20);}
  clearTimeout(guard);clearInterval(samplers);
  save('lanes.json',{passed:true,records,runtimes,exits,workerExits,metrics:[...metrics.values()],searchConcurrency:1,ownedChildrenClosed:true,fullDataset:false,scope:'actual Electron Utility private RPC + current compiled RawDataService; ordinary sandboxed BrowserWindow verified separately',rssSampling:'250ms Electron app metrics; process peak working set also recorded; unobserved transient peaks possible',workerOwnership:'all connections/statements created and closed in search thread; plain data messages only'});app.exit(0);
}).catch(async e=>{
  clearTimeout(guard);clearInterval(samplers);for(const endpoint of endpoints)if(!endpoint.closed)endpoint.p.kill();
  await delay(250);save(probesOnly?'probes-failure.json':'lanes-failure.json',{passed:false,error:e.stack,fatal,records,runtimes,exits,workerExits,metrics:[...metrics.values()],pending:[...pending.keys()]});app.exit(1);
});
