// native stop 之后仅做语法/文档/来源/清理审计，不启动新增 workload。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {audit,inventory,root,output,save} from './search2-lib.mjs';
const appRoot=path.resolve(import.meta.dirname,'../..'),target=path.join(appRoot,'docs/investigations/evidence/phase-2-search-candidate-source-controlled-retry.json'),e=JSON.parse(fs.readFileSync(target)),commands=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
const run=(program,args)=>{const text=execFileSync(program,args,{cwd:appRoot,encoding:'utf8'}).trim();commands.push({command:[program,...args].join(' '),passed:true,output:text});return text;};
for(const name of fs.readdirSync(import.meta.dirname).filter(n=>/^search2-.*\.(mjs|cjs)$/.test(n)).concat('search-lib.mjs'))run(process.execPath,['--check',path.join(import.meta.dirname,name)]);
run(process.execPath,['scripts/check-docs.mjs']);run('git',['diff','--check']);
// tools README 不在既有 docs checker 范围内，补查其实际相对链接。
const readme=path.join(import.meta.dirname,'README.md');let toolLinks=0;
for(const m of fs.readFileSync(readme,'utf8').matchAll(/\]\(([^)]+)\)/g)){if(/^(https?:|mailto:)/.test(m[1]))continue;assert(fs.existsSync(path.resolve(path.dirname(readme),m[1].split('#')[0])));toolLinks++;}
assert.equal(run('git',['status','--porcelain=v1','--','src',':(glob)**/package.json',':(glob)**/package-lock.json',':(glob)**/pnpm-lock.yaml',':(glob)**/yarn.lock']), '');
assert.equal(run('git',['rev-parse','HEAD']),e.delivery.applicationHead);
assert.equal(sha(fs.readFileSync(path.join(import.meta.dirname,'search-lib.mjs'))),e.controlledRetry.manifest.scanner.currentBeforeSha256);
assert(e.controlledRetry.manifest.inputFiles.every(f=>sha(fs.readFileSync(path.join(import.meta.dirname,f.name)))===f.sha256));
assert(e.controlledRetry.manifest.priorArtifacts.every(f=>sha(fs.readFileSync(output(f.name)))===f.sha256));
const after=await audit(),before=e.delivery.representativeSourceAfterCleanup;
assert.deepEqual(after.repository,before.repository);assert.deepEqual(after.fingerprints,before.fingerprints);
const files=await inventory();assert.equal(files.length,e.delivery.metadataSourceCount);assert.equal(files.reduce((n,f)=>n+f.bytes,0),e.controlledRetry.inputAudit.rawBytes);
const leftovers=fs.readdirSync(root).filter(n=>/\.db(?:-(wal|shm|journal))?$/.test(n)||n==='baseline.json'||n==='s1.db-census.json');assert.equal(leftovers.length,0);assert.equal(fs.readdirSync(path.join(root,'sqlite-temp')).length,0);
const ids=e.delivery.processAudit.knownPids.filter(id=>id!==process.pid);const live=run('pwsh',['-NoProfile','-Command',`Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime | ConvertTo-Json -Compress; exit 0`]);assert.equal(live,'');
assert(e.stages.every(s=>s.childClosed));assert.equal(e.stages.at(-1).ordinal,19);assert.equal(e.lanes.nativeExitDecimal,0x80000003);
e.delivery.validationPending=false;e.delivery.validation={checkedAt:new Date().toISOString(),commands,toolReadmeLocalLinks:toolLinks,formatCheck:{command:'npm.cmd run format:check',passed:true,scope:'executed successfully in this delivery; managed formatter targets unchanged afterwards'},relatedChecks:{fullReferenceMemberships:e.fullMembershipProof.complete,queryIdentities:e.exact.observations.every(x=>x.identitiesMatched)&&e.contains.observations.every(x=>x.identitiesMatched),finalReferenceFixtures:e.fixtures.reference.passed,finalResolverFixtures:e.fixtures.resolver.passed,finalSpoolFixtures:e.fixtures.spool.passed,finalCodePointOracle:e.fixtures.canonical.passed,completionGuards:e.fixtures.completion.passed,lifecycle:e.lifecycle.passed},freshMetadataObservation:{sourceCount:files.length,rawBytes:files.reduce((n,f)=>n+f.bytes,0),sha256:sha(JSON.stringify(files)),scope:'fresh final metadata observation; full per-file baseline equality was checked before owned cleanup'},sourceAfterFinalChecks:after,scannerRestored:true,priorArtifactsUnchanged:true,noLargeDbOrStaging:true,ownedChildProcesses:0,productionBuilds:0};
e.toolFingerprints=fs.readdirSync(import.meta.dirname).filter(n=>/^search2-.*\.(mjs|cjs)$/.test(n)).map(name=>({name,sha256:sha(fs.readFileSync(path.join(import.meta.dirname,name)))}));
e.liveResourceProbes={reference:JSON.parse(fs.readFileSync(output('controlled-retry/reference-live-probe.json'))),hash:JSON.parse(fs.readFileSync(output('controlled-retry/hash-live-probe.json')))};
e.harnessFailures.closeoutAudit=JSON.parse(fs.readFileSync(output('controlled-retry/closeout-audit-repair.json')));
fs.writeFileSync(target,JSON.stringify(e,null,2)+'\n');save('controlled-retry/delivery-validation.json',e.delivery.validation);
console.log(JSON.stringify({passed:true,syntaxFiles:commands.filter(c=>c.command.includes('--check ')).length,toolReadmeLocalLinks:toolLinks,ownedChildProcesses:0,productionUnchanged:true,architecture:e.architectureConclusion,nativeStopRetained:true}));
