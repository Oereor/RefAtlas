// Export stopped-stage evidence and clean only explicitly owned artifacts after a final audit.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { audit, inventory, load, save, root, output, removeOwned } from './search2-lib.mjs';
const appRoot = path.resolve(import.meta.dirname, '../..'), baseline = load('baseline.json'), after = await audit(), files = await inventory();
const metadataUnchanged = files.length === baseline.files.length && files.every((f, i) => f.path === baseline.files[i].path && f.stamp === baseline.files[i].stamp && f.bytes === baseline.files[i].bytes);
const externalUnchanged = metadataUnchanged && JSON.stringify(after.repository) === JSON.stringify(baseline.repository) && JSON.stringify(after.fingerprints) === JSON.stringify(baseline.fingerprints);
const git = args => execFileSync('git', args, { cwd: appRoot, encoding: 'utf8' }).trim();
const productionDiff = git(['status', '--porcelain=v1', '--', 'src', 'package.json', 'package-lock.json', 'tools/investigation/package.json', 'tools/investigation/package-lock.json']);
if (!externalUnchanged || productionDiff) throw Error('DELIVERY_INTEGRITY_FAILED');
const previous = JSON.parse(fs.readFileSync(path.join(appRoot, 'docs/investigations/evidence/phase-2-search-measurements.json')));
const pipeline = load('pipeline.json'), pilot = load('pilot.db-build.json'), pilotCensus = load('pilot.db-census.json'), failure = load('failure-forensic.json'), fixtures = load('fixture-checks.json');
const fullStage = pipeline.find(s => s.stage === 'search2-build');
if (fullStage.exit === 0 || !failure.noCompleteCandidateSizeOrTiming || !fixtures.passed || !pipeline.every(s => s.childClosed)) throw Error('UNEXPECTED_STAGE_EVIDENCE');
const removed = [];
for (const name of fs.readdirSync(root)) {
  if (/\.db(?:-(?:wal|shm|journal))?$/.test(name) || name === 'baseline.json') removed.push(removeOwned(name));
}
const temp = output('sqlite-temp');
if (fs.realpathSync(temp) !== temp) throw Error('TEMP_SYMLINK');
for (const name of fs.readdirSync(temp)) {
  const p = path.resolve(temp, name);
  if (path.dirname(p) !== temp || !fs.lstatSync(p).isFile() || fs.lstatSync(p).isSymbolicLink()) throw Error('UNSAFE_TEMP_CLEANUP');
  removed.push({ name: path.relative(root, p), bytes: fs.statSync(p).size }); fs.unlinkSync(p);
}
const evidence = {
  status: 'STOPPED / REQUIRES ROUND 3 / AWAITING REVIEW', generatedAt: new Date().toISOString(), applicationHead: git(['rev-parse', 'HEAD']),
  architectureAccepted: false, architectureConclusion: 'NO / REQUIRES ROUND 3', architectureDisproved: false,
  baseline: { sourceCount: baseline.files.length, rawBytes: baseline.files.reduce((n, f) => n + f.bytes, 0), ...after },
  reusedRound1: { evidence: 'phase-2-search-measurements.json', fullRawOccurrences: 83533059, navigableOccurrences: 83513357, navigableTerms: 8827401, oldCBytes: previous.variants.C.final.db, statValidationMs: 7320, strictHashValidationMs: 83200, validationTimesApproximateFromPriorReport: true, feffPrerequisite: 'production fix required separately', duplicateSources: 15 },
  pilot: { build: pilot, census: pilotCensus, selectedNotRepresentative: true }, failure,
  fixtureChecks: fixtures, pipeline,
  deferred: { fullMembershipCensus: 'native-crash stop', fullDFCardinality: 'native-crash stop', completeS1Space: 'native-crash stop', countVariants: 'native-crash stop', hash8And16FullBuild: 'native-crash stop', S2: 'no completed S1 evidence warrants continuation', S3: 'no completed tail evidence warrants continuation', exactRealBenchmarks: 'no complete candidate', containsRealBenchmarks: 'no complete candidate', fullIndependentMembershipProof: 'no complete candidate', executionLane: 'stopped before Stage 6', lifecyclePerformanceAndSpoolStress: 'stopped' },
  delivery: { externalUnchanged, metadataUnchanged, representativeHashesUnchanged: true, sourceCount: files.length, productionUnchanged: !productionDiff, packageAndLockUnchanged: !productionDiff, allDbHandlesClosed: true, ownedChildProcesses: 0, childExitRecords: pipeline.map(s => ({ stage: s.stage, exit: s.exit, childClosed: s.childClosed })), cleanup: { removed, removedBytes: removed.reduce((n, f) => n + f.bytes, 0), validatedOwnedRoot: root }, noProductionSearch: true, noCommitPushOrPR: true }
};
save('delivery.json', evidence.delivery);
const target = path.join(appRoot, 'docs/investigations/evidence/phase-2-search-candidate-source-measurements.json');
fs.writeFileSync(target, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ evidence: target, externalUnchanged, productionUnchanged: !productionDiff, removedBytes: evidence.delivery.cleanup.removedBytes, ownedChildProcesses: 0 }));
