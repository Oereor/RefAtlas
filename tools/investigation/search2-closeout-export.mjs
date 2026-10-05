// 终态验收与紧凑 evidence；保留原始日志，不把失败导出成成功。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, repo, save, sha } from './search2-closeout.mjs';
const load = name => JSON.parse(fs.readFileSync(path.join(root,name),'utf8').replace(/^\uFEFF/,''));
const summary = values => { const a=[...values].sort((a,b)=>a-b);const at=q=>a[Math.max(0,Math.ceil(a.length*q)-1)]||0;return {n:a.length,min:a[0]||0,p50:at(.5),p95:at(.95),max:at(1)}; };
const compactRpc = s => s.responses.map(r=>({operation:r.result.observations[0].operation,rpcWallMs:r.rpcWallMs,emittedAt:r.emittedAt,receivedAt:r.receivedAt,...r.result.observations[0],utilityEnteredAt:r.result.enteredAt,utilityWallMs:r.result.utilityWallMs,queue:r.result.queue,eventLoop:r.result.eventLoop}));
const compactLoad = l => ({result:l.result,rpcWallMs:l.rpcWallMs,started:l.started,progressCount:l.progressCount,phases:l.phases,cancellation:l.cancellation,nativeReturned:l.nativeReturned,released:l.released,progress:l.progress.slice(0,2),progressTail:l.progressTail.slice(-3)});
const compactRecord = r=>({...r,...(r.load?{load:compactLoad(r.load)}:{}),...(r.browser?{browser:compactRpc(r.browser)}:{}),...(r.suites?{suites:r.suites.map(compactRpc)}:{}),...(r.responses?{responses:compactRpc(r)}:{})});
export function inspectLanes(lanes, addendum = null) {
  assert.equal(lanes.passed,true);assert.equal(lanes.ownedChildrenClosed,true);
  assert.equal(lanes.searchConcurrency,1);assert.equal(lanes.fullDataset,false);
  assert(lanes.exits.every(e=>e.code===e.expected));assert(lanes.workerExits.every(e=>e.code===e.expected));
  const matrix=lanes.records.filter(r=>r.phase==='matrix');assert.equal(matrix.length,16);
  for(const r of matrix){assert(r.overlap.every(Boolean));assert.equal(r.load.result.complete,true);assert.equal(r.load.result.cancelled,false);assert.equal(r.load.result.owner.handlesClosed,true);assert(r.load.released);for(const s of r.suites){assert.equal(s.responses.length,6);for(const a of s.responses){assert.equal(a.result.observations.length,1);assert(a.result.observations[0].ok);}}}
  const cancellations=lanes.records.filter(r=>r.phase==='cooperative-cancellation');assert.equal(cancellations.length,4);
  for(const r of cancellations){assert(r.load.result.cancelled);assert.equal(r.load.result.complete,false);assert.equal(r.load.result.recovery.quickCheck,'ok');assert.notEqual(r.load.result.recovery.state,'ready');assert(r.load.cancellation.some(m=>m.type==='cancel-ack'&&m.taskActive));assert(r.load.released);}
  const failures=lanes.records.filter(r=>r.phase==='controlled-failure');assert.equal(failures.length,2);
  for(const r of failures){assert.equal(r.exit.code,23);const recovery=r.recovery.length?r.recovery:r.mode==='dedicated-utility'&&addendum?.passed?addendum.recovery:[];assert(recovery.length===1,'controlled exit DB must be reopened exactly once');assert(recovery.every(x=>x.recovery.quickCheck==='ok'&&x.recovery.state!=='ready'));assert(r.browser.responses.every(x=>x.result.observations[0].ok));}
  return {matrixRows:matrix.length,browserMatrixRpcs:matrix.reduce((n,r)=>n+r.suites.reduce((n,s)=>n+s.responses.length,0),0),cooperativeCancellations:cancellations.length,controlledFailures:failures.length};
}
function exportEvidence(){
  const baseline=load('baseline.json'),lanes=load('lanes.json'),addendum=load('controlled-failure-recovery-addendum.json'),validation=inspectLanes(lanes,addendum),acl=load('acl-audit.json'),input=load('final-input-audit.json'),smoke=load('report.json');
  assert(acl.passed&&input.immutableUnchanged&&input.sourcesUnchanged&&input.externalUnchanged);assert(smoke.ok&&smoke.security.sandbox&&smoke.security.contextIsolation&&!smoke.security.nodeIntegration);
  const matrix=lanes.records.filter(r=>r.phase==='matrix');
  const laneSummary=Object.fromEntries(['worker','dedicated-utility'].map(mode=>[mode,Object.fromEntries(['listDirectory','getSourceInfo','readNode','listNodeChildren','readScalarSegment','sourceActivation'].map(operation=>{
    const a=matrix.filter(r=>r.mode===mode).flatMap(r=>r.suites.flatMap(s=>compactRpc(s))).filter(r=>r.operation===operation);
    return [operation,{rpcMs:summary(a.map(r=>r.rpcWallMs)),queueMs:summary(a.flatMap(r=>r.queue.map(q=>q.queueMs))),executionMs:summary(a.flatMap(r=>r.queue.map(q=>q.executionMs))),errors:a.filter(r=>!r.ok).length}];
  }))]));
  const records=lanes.records.map(compactRecord);
  const corrected=fs.existsSync(path.join(root,'probes-corrected.json'))?load('probes-corrected.json'):null;
  assert(corrected?.passed);assert.equal(corrected.records.filter(r=>r.phase==='blocking-probe').length,6);
  assert(corrected.exits.every(e=>e.code===0));assert(corrected.workerExits.every(e=>e.code===0));
  for(const r of corrected.records.filter(r=>r.phase==='blocking-probe')){assert(r.load.result.owner.handlesClosed);assert(r.load.released);assert(r.load.cancellation.some(c=>c.type==='cancel-ack'));assert(r.browser.responses.every(x=>x.result.observations[0].ok));}
  const infoProbe=mode=>corrected.records.find(r=>r.phase==='blocking-probe'&&r.mode===mode&&r.kind==='js-probe').browser.responses.find(x=>x.result.observations[0].operation==='getSourceInfo').rpcWallMs;
  assert(infoProbe('same-thread')>10*infoProbe('worker'));assert(infoProbe('same-thread')>10*infoProbe('dedicated-utility'));
  const evidence={schemaVersion:1,measuredAt:new Date().toISOString(),status:'EXECUTION GATE VALIDATED / ARCHITECTURE SUPPORTED FOR REVIEW / AWAITING REVIEW',baseline:{...baseline,fingerprints:baseline.fingerprints},reproduction:load('reproduction-review.json'),recovery:load('recovery-review.json'),acl:{audit:acl,mutation:load('acl-mutation.json'),plan:load('acl-recovery-plan.json'),chain:load('acl-chain-before.json'),backupSha256:sha(path.join(root,'electron-dist.acl')),finalDistRoot:load('acl-dist-after.json').find(x=>x.path.endsWith('electron\\dist'))},smoke:{manifest:load('ordinary-built-smoke-owner-manifest.json'),ok:smoke.ok,security:smoke.security,platform:smoke.platform,arch:smoke.arch,checks:smoke.renderer.checks,consoleErrors:smoke.renderer.consoleErrors,reportSha256:sha(path.join(root,'report.json'))},lanes:{validation,launch:load('lane-suite-manifest.json'),toolFingerprints:load('lane-tool-fingerprints.json'),records,runtimes:lanes.runtimes,exits:lanes.exits,workerExits:lanes.workerExits,metrics:lanes.metrics,laneSummary,correctedProbes:corrected},inputAudit:{sourcesUnchanged:input.sourcesUnchanged,immutableUnchanged:input.immutableUnchanged,externalUnchanged:input.externalUnchanged},cleanup:fs.existsSync(path.join(root,'cleanup.json'))?load('cleanup.json'):null,limitations:['Windows x64 investigation prototype; not macOS/packaged Search validation','Frozen bounded source subsets; no full index/query benchmark rerun','Normal user Electron execution after restricted token failure; no sandbox security flags changed','250ms process metrics/100ms file sizes may miss transient peaks','Source activation first validation separated from cached competition','Historical 0xC0000409 root cause unknown; no new unexplained native crash','Production FEFF repair remains prerequisite; no accepted ADR or Search implementation']};
  evidence.lanes.correctedProbes={...corrected,records:corrected.records.map(compactRecord)};
  evidence.lanes.controlledFailureRecoveryAddendum=addendum;
  evidence.lanes.correctedProbeToolFingerprints=load('corrected-probes-tools.json');
  evidence.executionIdentities={restricted:'OMEN-LAPTOP\\CodexSandboxOffline',ordinary:load('owner-runtime.json').identity,restrictedSmoke:load('ordinary-built-smoke-manifest.json'),normalOwnerRecovery:load('recovery-review.json'),normalOwnerSmoke:load('ordinary-built-smoke-owner-manifest.json')};
  evidence.boundaryChecks=load('boundary-checks.json');
  evidence.validationChecks=fs.existsSync(path.join(root,'delivery-checks.json'))?load('delivery-checks.json'):null;
  evidence.processAudit=fs.existsSync(path.join(root,'process-audit.json'))?load('process-audit.json'):null;
  assert.equal(evidence.processAudit?.ownedProcessCount,0);assert.equal(evidence.cleanup?.remainingDatabaseFiles,0);assert(evidence.cleanup.aclBackupPreserved);assert(evidence.boundaryChecks.passed);assert(evidence.validationChecks?.passed);
  evidence.historicalFilesRestoration=load('historical-restoration.json');assert(evidence.historicalFilesRestoration.every(x=>x.restored));
  assert.equal(sha(path.join(root,'full-matrix-main-version.cjs')),evidence.lanes.toolFingerprints.tools['search2-closeout-electron.cjs']);
  assert.equal(sha(path.join(root,'full-matrix-lane-version.cjs')),evidence.lanes.toolFingerprints.tools['search2-closeout-lane.cjs']);
  evidence.finalDeliveryToolFingerprints=Object.fromEntries(fs.readdirSync(import.meta.dirname).filter(n=>n.startsWith('search2-closeout')&&/\.(mjs|cjs|ps1)$/.test(n)).map(n=>[n,sha(path.join(import.meta.dirname,n))]));
  const target=path.join(repo,'docs/investigations/evidence/phase-2-search-execution-lane-measurements.json');fs.writeFileSync(target,JSON.stringify(evidence,null,2)+'\n');save('closeout-validation.json',{passed:true,...validation,immutableUnchanged:true,sourcesUnchanged:true,externalUnchanged:true,evidenceBytes:fs.statSync(target).size});console.log(JSON.stringify({validation,laneSummary,evidenceBytes:fs.statSync(target).size}));
}
if(process.argv[1]===import.meta.filename){if(process.argv[2]==='inspect'){const lanes=load('lanes.json');console.log(inspectLanes(lanes,load('controlled-failure-recovery-addendum.json')));}else exportEvidence();}
