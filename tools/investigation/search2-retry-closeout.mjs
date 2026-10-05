// 非零 Attempt #2 的受限收尾。拒绝把成功分支尚未完成的调查导出为成功。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { audit, root, removeOwned } from './search2-lib.mjs';
const appRoot = path.resolve(import.meta.dirname, '../..'), retryRoot = path.join(root, 'controlled-retry');
const target = path.join(appRoot, 'docs/investigations/evidence/phase-2-search-candidate-source-controlled-retry.json');
const read = name => JSON.parse(fs.readFileSync(path.join(retryRoot, name)));
const a = read('terminal-audit.json'), m = a.manifest;
if (m.exit === 0 || !m.childClosed || !a.inputAudit.externalUnchanged || !a.inputAudit.scannerRestored || !a.inputAudit.priorArtifactsUnchanged || !a.inputAudit.productionUnchanged) throw Error('FAILURE_CLOSEOUT_NOT_ELIGIBLE');
const processCommand = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.ProcessId -ne ${process.pid} -and $_.CommandLine.Replace('\\','/').Contains('tools/investigation/search2') } | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress`;
const processes = execFileSync('pwsh', ['-NoProfile', '-Command', processCommand], { encoding: 'utf8' }).trim();
if (processes) throw Error('OWNED_NODE_PROCESS_STILL_ALIVE:' + processes);
const cleanup = [];
for (const name of fs.readdirSync(root)) if (/\.db(?:-(?:wal|shm|journal))?$/.test(name) || name === 'baseline.json') cleanup.push(removeOwned(name));
const temp = path.join(root, 'sqlite-temp');
if (fs.realpathSync(temp) !== temp) throw Error('TEMP_ROOT_LINK');
for (const name of fs.readdirSync(temp)) {
  const p = path.resolve(temp, name), s = fs.lstatSync(p);
  if (path.dirname(p) !== temp || !s.isFile() || s.isSymbolicLink()) throw Error('UNSAFE_TEMP_FILE');
  cleanup.push({ name: path.relative(root, p), bytes: s.size }); fs.unlinkSync(p);
}
const after = await audit();
if (JSON.stringify(after.repository) !== JSON.stringify(m.sourceBefore.repository) || JSON.stringify(after.fingerprints) !== JSON.stringify(m.sourceBefore.fingerprints)) throw Error('SOURCE_CHANGED_AFTER_CLEANUP');
const sha = b => createHash('sha256').update(b).digest('hex');
if (!m.priorArtifacts.every(f => sha(fs.readFileSync(path.join(root, f.name))) === f.sha256)) throw Error('PRIOR_EVIDENCE_CHANGED');
const nativeFailure = m.exit != null && (m.exit >>> 0) >= 0x80000000 && !m.terminationReason;
const evidence = {
  status: nativeFailure ? 'BLOCKED BY NATIVE STABILITY / AWAITING REVIEW' : 'STOPPED ON FAILED CONTROLLED RETRY / AWAITING REVIEW',
  generatedAt: new Date().toISOString(), architectureAccepted: false, architectureConclusion: 'NO / REQUIRES ROUND 3', architectureDisproved: false,
  controlledRetry: a, eventLog: fs.existsSync(path.join(retryRoot, 'event-log.json')) ? read('event-log.json') : { inspected: false },
  checkpoints: fs.readFileSync(path.join(retryRoot, 'checkpoints.jsonl'), 'utf8').trim().split('\n').map(s => JSON.parse(s)),
  deferred: { fullMembershipCensus: 'Attempt #2 nonzero; partial prefix cannot be extrapolated', fullDFCardinality: 'no complete S1', exactContainsBenchmarks: 'retry stop condition', independentFullMembershipProof: 'no complete S1; prepared tool not executed', countHashS2S3: 'retry stop condition', executionLaneAndBrowserCompetition: 'retry stop condition', lifecycleAndBroadSpool: 'retry stop condition', nativeCrashInvestigation: 'requires separate authorization; not executed', attempt3: 'forbidden; not executed', productionSearchAndFEFF: 'not authorized; unchanged' },
  delivery: { allKnownDbHandlesClosed: true, ownedChildProcesses: 0, processAudit: { checkedAt: new Date().toISOString(), scope: 'all live node.exe command lines containing tools/investigation/search2, excluding this closeout process', matches: [] }, sourceAfterCleanup: after, sourceAfterCleanupUnchanged: true, productionUnchanged: true, packageAndLockUnchanged: true, scannerRestored: true, priorArtifactsUnchanged: true, cleanup: { validatedOwnedRoot: root, files: cleanup, removedBytes: cleanup.reduce((n, f) => n + f.bytes, 0) }, noCommitPushPR: true },
};
fs.writeFileSync(target, JSON.stringify(evidence, null, 2) + '\n');
fs.writeFileSync(path.join(retryRoot, 'closeout.json'), JSON.stringify(evidence.delivery, null, 2) + '\n');
console.log(JSON.stringify({ target, status: evidence.status, removedBytes: evidence.delivery.cleanup.removedBytes, externalUnchanged: true, scannerRestored: true, ownedChildProcesses: 0 }));
