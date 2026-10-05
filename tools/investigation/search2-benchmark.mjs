// ID-first / Contains 的真实 raw 恢复；计时与独立 truth 分开，产物有界且串行。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { db, load, save, now, dataRoot, resultIdentity, exactKey, output, removeOwned, progress, safety } from './search2-lib.mjs';
import { candidates, resolveOccurrences, readSpoolPage } from './search2-resolve.mjs';
import { referenceScan } from './search2-reference.mjs';
const phase = process.argv[2];
if (!['exact', 'contains'].includes(phase) || !load('reference-memberships.json').complete) throw Error('QUERY_GATE_NOT_PASSED');
const all = load('queries.json').queries;
const queries = all.filter(q => phase === 'exact' ? q.match === 'exact' && (q.label.startsWith('id-') || q.bucket) : q.match === 'contains' && !['common-text', 'contains-field', 'contains-number'].includes(q.label));
const d = db('s1.db', true), observations = [], began = now();
const typedIdentity = (f, s) => JSON.stringify([f.class, s.path, f.pointer, f.valueKind || f.kind, f.kind, exactKey(f.kind, f.text), s.sha256]) + '\n';
const refMatch = (q, f) => (q.scope === 'VALUE' ? f.class === 'VALUE' : q.scope === 'FIELD' ? f.class === 'FIELD' : f.kind.toUpperCase() === q.scope) && (q.match === 'exact' ? f.text === q.query : f.text.includes(q.query));
function clearSpool(name) { for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(output(name + suffix))) removeOwned(name + suffix); }
try {
  for (const q of queries) {
    safety(1024 ** 3); const runs = []; let candidateSources;
    for (let run = 0; run < 2; run++) {
      const queryStart = now(); let firstPageMs = null, firstPageRows = 0, pageReadMs = 0;
      const candidate = await candidates(d, q); candidateSources = candidate.sources;
      const rawTypes = createHash('sha256'), name = `benchmark-${q.label}-${run}.db`;
      const pageOptions = { generation: `${phase}/${q.label}/${run}`, cacheGeneration: load('reference-memberships.json').orderedMembershipDigest };
      let result;
      try { result = await resolveOccurrences(q, candidate.sources, { name, ...pageOptions, candidateMs: candidate.metrics.lookupMs, onMatch(f, s) { rawTypes.update(typedIdentity(f, s)); }, onSource: async () => {
        if (firstPageMs !== null) return;
        const t = now(), page = readSpoolPage(name, pageOptions); pageReadMs += now() - t;
        if (page.rows.length >= Math.min(50, candidate.metrics.estimatedOccurrences || 1)) { firstPageMs = now() - queryStart; firstPageRows = page.rows.length; }
      } }); }
      finally { clearSpool(name); }
      const { sourceResults, ...compact } = result;
      runs.push({ run: run === 0 ? 'first observed' : 'repeat observed', candidate: candidate.metrics, resolution: compact, firstPublishedPageMs: firstPageMs, firstPublishedPageRows: firstPageRows, pageReadMs, rawTypeIdentityDigest: rawTypes.digest('hex'), sourceResultsDigest: createHash('sha256').update(JSON.stringify(sourceResults)).digest('hex') });
      progress({ stage: phase + '-resolution', label: q.label, run, candidates: candidate.sources.length, candidateBytes: candidate.metrics.candidateBytes, occurrences: result.count, fullMs: result.fullMs });
      save('benchmark-' + phase + '-progress.json', { complete: false, observations, activeQuery: q, completedRuns: runs });
    }
    const truthStarted = now(), digest = createHash('sha256'), rawTypes = createHash('sha256'); let count = 0, sourcesChecked = 0;
    for (const source of candidateSources) {
      const parsed = await referenceScan(path.join(dataRoot, source.path), { onFact(f) { if (refMatch(q, f)) { count++; digest.update(resultIdentity(f, source.path, source.sha256) + '\n'); rawTypes.update(typedIdentity(f, source)); } } });
      if (parsed.sha256 !== source.sha256 || parsed.stamp !== source.stamp || parsed.duplicateKeys) throw Error('QUERY_REFERENCE_SOURCE_CHANGED_OR_AMBIGUOUS'); sourcesChecked++;
    }
    const truth = { count, sourcesChecked, orderedIdentityDigest: digest.digest('hex'), rawTypeIdentityDigest: rawTypes.digest('hex'), wallMs: now() - truthStarted, independentParser: 'stream-json 3.7.0', scope: 'all ready candidate sources; full membership proof establishes candidate completeness in navigable scope' };
    for (const run of runs) { assert.equal(run.resolution.count, count); assert.equal(run.resolution.verifiedCount, count); assert.equal(run.resolution.orderedIdentityDigest, truth.orderedIdentityDigest); assert.equal(run.rawTypeIdentityDigest, truth.rawTypeIdentityDigest); }
    observations.push({ query: q, runs, truth, identitiesMatched: true, navigableScopeComplete: true, workspaceSearchComplete: false, ambiguousSourceCount: 15 });
    save('benchmark-' + phase + '-progress.json', { complete: false, observations });
  }
  const result = { complete: true, phase, observations, wallMs: now() - began, noColdCacheClaim: true, noCrossPlatformSLA: true, exactTypedDomainsPreserved: true, productionSearch: false };
  save('benchmark-' + phase + '.json', result); console.log(JSON.stringify({ complete: true, phase, queries: observations.length, wallMs: result.wallMs }));
} finally { d.close(); }
