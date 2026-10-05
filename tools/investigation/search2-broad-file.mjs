// broad workload 只刻画成本、验证页、增长和取消；FILE 独立 catalog baseline。
import fs from 'node:fs';
import { db, load, save, output, removeOwned, now, disk, progress } from './search2-lib.mjs';
import { candidates, resolveOccurrences, readSpoolPage } from './search2-resolve.mjs';
if (!load('benchmark-exact.json').complete || !load('benchmark-contains.json').complete) throw Error('SELECTIVE_QUERY_GATE_REQUIRED');
const d = db('s1.db', true), began = now(), catalogStart = now();
const catalog = d.prepare('SELECT id,path,bytes,state FROM files ORDER BY id').all(), catalogLoadMs = now() - catalogStart;
const fileQueries = [['basename', 'exact', 'AvatarConfig.json'], ['path', 'exact', 'ExcelOutput/AvatarConfig.json'], ['path', 'contains', 'Level/Mission']];
const fileResults = [];
for (const [scope, match, query] of fileQueries) for (let run = 0; run < 2; run++) {
  const t = now(), hits = catalog.filter(f => { const text = scope === 'basename' ? f.path.slice(f.path.lastIndexOf('/') + 1) : f.path; return match === 'exact' ? text === query : text.includes(query); });
  fileResults.push({ scope, match, query, run, ms: now() - t, sourceCount: hits.length, bytes: hits.reduce((n, f) => n + f.bytes, 0), samplePaths: hits.slice(0, 5).map(f => f.path), catalogCoverage: catalog.length, includesAmbiguousSources: true });
}
const selected = load('queries.json').queries.filter(q => q.label.startsWith('broad-') || q.label.startsWith('field-') || ['common-text', 'contains-field', 'contains-number'].includes(q.label));
const observations = [], cacheGeneration = load('reference-memberships.json').orderedMembershipDigest;
const cleanup = name => { for (const s of ['', '-wal', '-shm']) if (fs.existsSync(output(name + s))) removeOwned(name + s); };
try {
  for (const q of selected) {
    const start = now(), c = await candidates(d, q), controller = new AbortController(), name = 'broad-' + q.label + '.db';
    const generation = q.label + '/characterization', pageOptions = { generation, cacheGeneration };
    let firstPageMs = null, first50Ms = null, firstPageRows = 0, cancelRequested = null, last = null, maxDbBytes = 0, maxWalBytes = 0, maxRss = 0, outcome;
    try {
      outcome = await resolveOccurrences(q, c.sources, { name, ...pageOptions, signal: controller.signal, candidateMs: c.metrics.lookupMs, onChunk: async m => {
        last = m; const sizes = disk(name); maxDbBytes = Math.max(maxDbBytes, sizes.db); maxWalBytes = Math.max(maxWalBytes, sizes['-wal']); maxRss = Math.max(maxRss, process.memoryUsage().rss);
        // 这是本次 characterization 明确的采样/取消目标，非产品 query hard reject。
        if (first50Ms !== null && m.count >= 3000) { cancelRequested = now(); controller.abort(); }
      }, onSource: async () => {
        const p = readSpoolPage(name, pageOptions);
        if (p.rows.length && firstPageMs === null) { firstPageMs = now() - start; firstPageRows = p.rows.length; }
        if (p.rows.length === 50 && first50Ms === null) first50Ms = now() - start;
      } });
    } catch (e) { if (e.message !== 'CANCELLED') throw e; outcome = { ...e.observation, cancelled: true, cancellationLatencyMs: now() - cancelRequested }; }
    const reopen = readSpoolPage(name, pageOptions); const wrongGeneration = (() => { try { readSpoolPage(name, { ...pageOptions, generation: 'old' }); return false; } catch (e) { return e.message === 'STALE_QUERY_CURSOR'; } })();
    const { sourceResults, ...compact } = outcome;
    observations.push({ query: q, candidate: c.metrics, outcome: compact, firstPageMs, first50Ms, firstPageRows, lastCheckpoint: last, maxDbBytes, maxWalBytes, maxRss, reopenRows: reopen.rows.length, reopenedState: reopen.state, oldGenerationRejected: wrongGeneration, measurementScope: 'cancel after >=3000 provisional matches and verified first 50; if exhausted earlier, only candidate resolution complete' });
    cleanup(name); progress({ stage: 'broad-characterization', label: q.label, candidates: c.sources.length, estimatedOccurrences: c.metrics.estimatedOccurrences, firstPageMs, cancelled: !!outcome.cancelled });
    save('broad-file-progress.json', { complete: false, observations, fileResults });
  }
  const c = new AbortController(), requestedAt = { ms: null }, cancelStart = now();
  const timer = setTimeout(() => { requestedAt.ms = now(); c.abort(); }, 50);
  let dictionaryCancellation;
  try { await candidates(d, { scope: 'STRING', match: 'contains', query: 'Avatar' }, { signal: c.signal }); dictionaryCancellation = { cancelled: false }; }
  catch (e) { if (e.message !== 'CANCELLED') throw e; dictionaryCancellation = { cancelled: true, complete: false, totalMs: now() - cancelStart, requestLatencyMs: now() - requestedAt.ms }; }
  finally { clearTimeout(timer); }
  save('broad-file.json', { complete: true, catalogLoadMs, fileResults, observations, dictionaryCancellation, wallMs: now() - began, boundedPageSize: 50, noCompleteMillionOccurrenceClaim: true, productHardRejectImplemented: false });
} finally { d.close(); }
