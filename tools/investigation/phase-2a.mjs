import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { runIsolated } from './run.mjs';
import { samples, sourcePath, hashFile, gitState, environment, toolRoot, writeArtifact } from './common.mjs';

const additional = ['ExcelOutput/IdleLiveQuestionSpEquip.json', 'Config/Resolution/ResolutionAdaptionMapping.json',
  'Config/GlobalConfig/RealtimeConst.json', 'Story/Mission/9999999/Story999999904.json',
  'Stages/SceneConstValueConfig.json', 'Stages/TAMonoTickLodSettingTemplate.json'];
const initial = gitState();
const experimentsOnly = process.argv.includes('--experiments-only');
const collectionsOnly = process.argv.includes('--collections-only');
const evidence = experimentsOnly || collectionsOnly ? JSON.parse(fs.readFileSync(path.join(toolRoot, 'artifacts/phase-2a.json'), 'utf8')) : { date: '2026-10-03', environment: environment(), initialState: initial,
  protection: { timeoutMs: 120000, nodeHeapMiB: 1024, rssLimitMiB: 2048, availableMemoryMinimumGiB: 3 },
  sampling: 'Phase 0 15 samples plus 6 explicit structural supplements; not whole-dataset lexical census',
  fingerprints: [], structures: [], experiments: {} };
assert.deepEqual(evidence.initialState, initial);
const previous = JSON.parse(fs.readFileSync(path.resolve(toolRoot, '../../docs/investigations/evidence/phase-0-measurements.json'), 'utf8'));
for (const relative of experimentsOnly || collectionsOnly ? [] : [...samples, ...additional]) {
  const filename = sourcePath(relative); const stat = fs.statSync(filename); const sha256 = await hashFile(filename);
  const old = previous.scan.fingerprints.find(x => x.path === relative);
  if (old) assert.equal(sha256, old.sha256, `Phase 0 fingerprint: ${relative}`);
  evidence.fingerprints.push({ path: relative, bytes: stat.size, mtimeMs: stat.mtimeMs, sha256, phase0FingerprintMatches: old ? true : null });
  console.error('Phase 2A structure: ' + relative);
  const run = await runIsolated('structure', relative, { script: path.join(toolRoot, 'phase-2a-child.mjs') });
  if (run.status !== 'ok') throw new Error(JSON.stringify(run));
  evidence.structures.push(run.result); writeArtifact('phase-2a.json', evidence);
}
if (collectionsOnly) {
  for (const relative of ['Config/SoundBankLookUp.json', 'Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json',
    ...additional.filter(s => /Resolution|Realtime|Story|TAMono/.test(s))]) {
    console.error('Phase 2A nested distribution: ' + relative);
    const run = await runIsolated('structure', relative, { script: path.join(toolRoot, 'phase-2a-child.mjs') });
    if (run.status !== 'ok') throw new Error(JSON.stringify(run));
    evidence.structures[evidence.structures.findIndex(s => s.path === relative)] = run.result;
  }
}
for (const mode of collectionsOnly ? [] : ['search', 'access']) {
  console.error('Phase 2A experiment: ' + mode);
  const run = await runIsolated(mode, '', { script: path.join(toolRoot, 'phase-2a-child.mjs') });
  if (run.status !== 'ok') throw new Error(JSON.stringify(run));
  evidence.experiments[mode] = run.result; writeArtifact('phase-2a.json', evidence);
}
evidence.finalState = gitState(); assert.deepEqual(evidence.finalState, initial);
for (const fingerprint of evidence.fingerprints) {
  assert.equal(await hashFile(sourcePath(fingerprint.path)), fingerprint.sha256);
  assert.equal(fs.statSync(sourcePath(fingerprint.path)).mtimeMs, fingerprint.mtimeMs);
}
evidence.datasetUnchanged = true;
writeArtifact('phase-2a.json', evidence);
console.log(JSON.stringify({ samples: evidence.structures.length, datasetUnchanged: true, output: 'artifacts/phase-2a.json' }));
