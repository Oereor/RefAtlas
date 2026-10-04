// 最终交付门控：检查、已完成清理和清理后的只读来源指纹；不依赖已删除的大产物。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { output,audit,save } from './search-lib.mjs';
const app=path.resolve(import.meta.dirname,'../..'),target=path.join(app,'docs/investigations/evidence/phase-2-search-measurements.json');
const reportPath=path.join(app,'docs/investigations/phase-2-search-architecture-full-dataset-investigation.md');
const e=JSON.parse(fs.readFileSync(target)),checks=JSON.parse(fs.readFileSync(output('checks.json'))),cleanup=JSON.parse(fs.readFileSync(output('cleanup.json')));
if(!checks.passed||!e.finalAudit.unchanged)throw new Error('DELIVERY_GATE_FAILED');
if(cleanup.files.some(f=>fs.existsSync(f.absolute)))throw new Error('CLEANUP_TARGET_STILL_EXISTS');
const afterCleanup=await audit();
const unchanged=JSON.stringify(afterCleanup.repository)===JSON.stringify(e.baseline.repository)&&JSON.stringify(afterCleanup.fingerprints)===JSON.stringify(e.baseline.fingerprints);
if(!unchanged)throw new Error('SOURCE_CHANGED_AFTER_CLEANUP');
function git(args){const r=spawnSync('git',args,{cwd:app,windowsHide:true,encoding:'utf8'});if(r.status!==0)throw new Error('GIT_DELIVERY_CHECK_FAILED');return r.stdout.trim();}
const appHead=git(['rev-parse','HEAD']);if(appHead!==e.applicationHead)throw new Error('APP_HEAD_CHANGED');
if(git(['status','--porcelain=v1','--','src','package.json','package-lock.json','tools/investigation/package.json','tools/investigation/package-lock.json']))throw new Error('PRODUCTION_CHANGED');
e.delivery={deliveredAt:new Date().toISOString(),checks,cleanup,applicationHead:appHead,productionUnchanged:true,sourceAfterCleanup:{...afterCleanup,unchanged},sourceStampFields:['dev','ino','size','mtimeNs','ctimeNs'],fullMetadataAuditBeforeCleanup:e.finalAudit,commits:0,pushes:0,pullRequests:0,productionSearchImplemented:false};
fs.writeFileSync(target,JSON.stringify(e,null,2)+'\n');
const start='<!-- validation:start -->',end='<!-- validation:end -->';let report=fs.readFileSync(reportPath,'utf8'),a=report.indexOf(start),b=report.indexOf(end);if(a<0||b<a)throw new Error('VALIDATION_MARKER_MISSING');
const text=`最终审计：外部HEAD仍为 \`${afterCleanup.repository.head}\`，status/diff为空；全部137,916来源path/stat与起始清单一致，清理后再次核对16个代表来源SHA-256、size、mtime/ctime与起始相同。stat stamp的字段顺序为dev/ino/size/mtimeNs/ctimeNs，纳秒整数以字符串保留。两个runtime与独立fallback另有137,901成功来源全量SHA一致证据。\n\n应用HEAD未变，生产src、应用及调查package/lockfile的diff/status为空；全部调查JS语法、受管format:check、文档本地链接/anchor与git diff --check通过，16项调查语义场景通过。production build=0；本轮无需重跑既有Browser跨平台gate。\n\n所有调查子进程结束、SQLite handle关闭后，先列清单并校验自有绝对目录，再移除${cleanup.files.length}个DB/sidecar/fixture/大型JSON产物，共${cleanup.removedBytes.toLocaleString('en-US')} bytes（${(cleanup.removedBytes/1024**3).toFixed(2)} GiB）。清理未递归访问来源或依赖；小型终态JSON/log留在忽略目录，完整DB不提交。紧凑证据包含清理清单和检查结果。\n\n报告交付待review；FEFF生产修复、全scalar trigram稳定性、direct C构建、隔离lane后的压力/取消、完整磁盘峰值与Mac/package/UI仍为OPEN。没有将候选写成已接受架构，也不宣称所有关键调查问题已关闭。`;
report=report.slice(0,a+start.length)+'\n'+text+'\n'+report.slice(b);fs.writeFileSync(reportPath,report);
const finalChecks=[];
for(const [name,exe,args] of [['docs',process.execPath,['scripts/check-docs.mjs']],['diff-whitespace','git',['diff','--check']]]){const r=spawnSync(exe,args,{cwd:app,encoding:'utf8',windowsHide:true});finalChecks.push({name,exit:r.status,output:r.stdout+r.stderr});if(r.status!==0)throw new Error('FINAL_DOCUMENT_CHECK_FAILED');}
e.delivery.finalDocumentChecks=finalChecks;fs.writeFileSync(target,JSON.stringify(e,null,2)+'\n');save('delivery.json',e.delivery);
console.log(JSON.stringify({reportPath,evidence:target,evidenceBytes:fs.statSync(target).size,sourceUnchanged:true,checksPassed:true,removedGiB:cleanup.removedBytes/1024**3,awaitingReview:true,criticalOpenItemsRemain:true}));
