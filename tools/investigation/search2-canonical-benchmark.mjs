// 新假设对照：canonical encoded prefilter + decoded verify；复用冻结独立 truth。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { db, load, save, now, output, removeOwned, progress } from './search2-lib.mjs';
import { candidates, resolveOccurrences } from './search2-resolve.mjs';
if (!load('controlled-retry/canonical-prefilter-fixtures.json').passed) throw Error('CANONICAL_FIXTURE_GATE');
const baseline = load('benchmark-contains.json'), d = db('s1.db', true), rows = [], began = now();
try {
  for (const b of baseline.observations) {
    const q = b.query, runs = [];
    for (let run = 0; run < 2; run++) {
      const c = await candidates(d, q, { dictionaryMode: 'canonical-range' });
      assert.equal(c.metrics.candidateSources, b.runs[0].candidate.candidateSources); assert.equal(c.metrics.candidateBytes, b.runs[0].candidate.candidateBytes); assert.equal(c.metrics.matchingTerms, b.runs[0].candidate.matchingTerms);
      let resolution = null;
      if (run === 0) {
        const name = 'canonical-benchmark.db';
        try { const r = await resolveOccurrences(q, c.sources, { name, candidateMs: c.metrics.lookupMs }); assert.equal(r.count, b.truth.count); assert.equal(r.orderedIdentityDigest, b.truth.orderedIdentityDigest); const { sourceResults, ...compact } = r; resolution = compact; }
        finally { for (const s of ['', '-wal', '-shm']) if (fs.existsSync(output(name + s))) removeOwned(name + s); }
      }
      runs.push({ run, candidate: c.metrics, resolution });
      progress({ stage: 'canonical-benchmark', label: q.label, run, lookupMs: c.metrics.lookupMs, count: resolution?.count });
    }
    rows.push({ query: q, runs, independentFrozenTruthParity: true }); save('canonical-benchmark-progress.json', { complete: false, observations: rows });
  }
  save('canonical-benchmark.json', { complete: true, observations: rows, wallMs: now() - began, hypothesis: 'encoded candidate superset, decoded literal verify before postings; preserves all original raw matching and Pointer recovery', baseline: 'benchmark-contains.json', repeatScope: 'candidate lookup only; raw recovery once against frozen independent truth', noColdCacheClaim: true });
} finally { d.close(); }
