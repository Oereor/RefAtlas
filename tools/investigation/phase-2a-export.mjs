// 仅导出紧凑证据，保留原始 artifacts 作为复核入口。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { toolRoot, artifactsRoot } from './common.mjs';
const read = name => JSON.parse(fs.readFileSync(path.join(artifactsRoot, name), 'utf8'));
const raw = read('phase-2a.json');
assert.equal(raw.datasetUnchanged, true);
const median = d => ({ n: d.count, medianMs: d.p50, maxMs: d.max });
const metadata = read('phase-2a-parser-metadata.json');
const { workspace, executable, ...environment } = raw.environment;
const evidence = { date: raw.date, environment, initialState: raw.initialState, finalState: raw.finalState,
  datasetUnchanged: true, protection: raw.protection, sampling: raw.sampling, fingerprints: raw.fingerprints,
  parser: { name: metadata.name, version: metadata.version, license: metadata.license, integrity: metadata.dist.integrity,
    registryUrl: 'https://registry.npmjs.org/@streamparser%2fjson/0.0.26', proxy: 'http://127.0.0.1:7890',
    installedTokenizerSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(toolRoot, 'node_modules/@streamparser/json/dist/mjs/tokenizer.js'))).digest('hex'),
    boundaries: { bom: 'skip UTF-8 BOM before tokenizer, add 3 to token offsets',
      loneSurrogateSqlite: 'direct TEXT U+D800 becomes U+FFFD; JSON canonical TEXT roundtrip passes', tests: 8 } },
  structures: raw.structures.map(({ readMs, analyzeMs, rssHighWaterMiB, topExamples, containers, ...s }) => ({ ...s,
    measurement: { readMs, analyzeMs, rssHighWaterMiB, input: 'whole raw Buffer + chunked tokenizer; not production streaming memory' },
    containers: containers.slice(0, s.path.includes('Baked') || s.path.includes('SoundBank') ? 6 : 3) })),
  search: { ...raw.experiments.search, outputs: raw.experiments.search.outputs.map(o => ({ ...o, queryResults: o.queryResults.map(q => ({ query: q.query,
    baseline: { matches: q.baseline.matches, ...median(q.baseline.ms) },
    like: { candidates: q.like.candidates, verified: q.like.verified, ...median(q.like.ms) },
    accelerator: { ...q.accelerator, ms: median(q.accelerator.ms) } })) })) },
  access: raw.experiments.access, electron: read('phase-2a-electron.json'),
  executionLimitations: ['registry curl: sandbox Schannel failure; explicit 7890 proxy succeeded in authorized local execution',
    'initial Electron sandbox ACL launch failure; authorized local execution succeeded; no ACL/sandbox changes'],
  claims: 'sample evidence and candidates only; no full production index, renderer/Preload workload or SLA' };
const target = path.resolve(toolRoot, '../../docs/investigations/evidence/phase-2a-measurements.json');
fs.writeFileSync(target, JSON.stringify(evidence) + '\n');
console.log(JSON.stringify({ path: 'docs/investigations/evidence/phase-2a-measurements.json', bytes: fs.statSync(target).size }));
