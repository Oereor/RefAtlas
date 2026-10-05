// Full membership distributions and deterministic benchmark selection, not entity inference.
import { db, load, save, histSummary, quantiles, now, progress } from './search2-lib.mjs';
const build = load('s1.db-build.json'), c = load('s1.db-census.json'), baseline = load('baseline.json');
if (!build.completed || c.errors.length || build.files !== baseline.files.length || c.sources.length !== baseline.files.length) throw Error('INCOMPLETE_CANDIDATE_NOT_ELIGIBLE_FOR_FULL_STATS');
const d = db('s1.db', true), began = now();
try {
  const hist = {}, distinct = {}, logical = { exactKeyBytes: 0, scanTextBytes: 0 };
  for (const row of d.prepare('SELECT kind,df,length(CAST(exact_key AS BLOB)) kb,length(CAST(scan_text AS BLOB)) tb FROM terms').iterate()) {
    hist[row.kind] ??= new Map(); hist[row.kind].set(row.df, (hist[row.kind].get(row.df) || 0) + 1); distinct[row.kind] = (distinct[row.kind] || 0) + 1;
    logical.exactKeyBytes += row.kb; logical.scanTextBytes += row.tb || 0;
  }
  const summaries = Object.fromEntries(Object.entries(hist).map(([k, h]) => [k, histSummary(h)]));
  const cardinalities = Object.fromEntries(['field', 'string', 'number', 'total'].map(k => [k, quantiles(c.sources.map(s => k === 'total' ? Object.values(s.counts).reduce((a, n) => a + n, 0) : s.counts[k] || 0))]));
  const sourceTop = [...c.sources].sort((a, b) => Object.values(b.counts).reduce((x, n) => x + n, 0) - Object.values(a.counts).reduce((x, n) => x + n, 0)).slice(0, 20);
  const totals = { occurrences: Object.values(c.rawOccurrences).reduce((a, n) => a + n, 0), memberships: Object.values(c.rawMemberships).reduce((a, n) => a + n, 0), navigableMemberships: Object.values(c.navigableMemberships).reduce((a, n) => a + n, 0), terms: Object.values(distinct).reduce((a, n) => a + n, 0) };
  const typeCompression = Object.fromEntries(Object.keys(c.rawOccurrences).map(k => [k, { occurrences: c.rawOccurrences[k], memberships: c.rawMemberships[k], navigableMemberships: c.navigableMemberships[k], ratio: c.rawOccurrences[k] / c.rawMemberships[k] }]));
  const topTerms = d.prepare('SELECT class,kind,exact_key,df,occurrences FROM terms ORDER BY df DESC,id LIMIT 30').all();
  save('stats.json', { totals, typeCompression, documentFrequency: summaries, cardinalities, largestSources: sourceTop, namedLargeSources: c.sources.filter(s => /TalkSentenceConfig|SpecialAvatarRelicMainValue|^TextMap\//.test(s.path)), logical, highFrequencyTerms: topTerms, ratio: totals.occurrences / totals.memberships, complete: true, censusErrors: c.errors, ambiguousSources: c.sources.filter(s => s.duplicateKeys).map(s => ({ path: s.path, duplicateKeys: s.duplicateKeys, occurrences: s.occurrences, counts: s.counts })), wallMs: now() - began });
  const fixed = [['id-1001', 'VALUE', '1001'], ['id-long-a', 'VALUE', '6186714091647966180'], ['id-long-b', 'VALUE', '16752756560315677817'], ...['1', '0', 'true', 'null'].map(q => ['broad-' + q, 'VALUE', q]), ['field-Value', 'FIELD', 'Value'], ['field-ID', 'FIELD', 'ID']].map(([label, scope, query]) => ({ label, scope, query, match: 'exact', category: 'fixed' }));
  const selected = [];
  for (const kind of ['number', 'string']) for (const [lo, hi, bucket] of [[1, 1, '1'], [2, 5, '2-5'], [6, 20, '6-20'], [21, 100, '21-100'], [101, 1e9, '100+']]) {
    const where = `kind=? AND df BETWEEN ? AND ? AND length(scan_text) BETWEEN 4 AND 20 AND scan_text GLOB '[1-9][0-9][0-9][0-9]*' AND scan_text NOT GLOB '*[^0-9]*'`;
    const n = d.prepare('SELECT count(*) n FROM terms WHERE ' + where).get(kind, lo, hi).n;
    if (!n) { selected.push({ kind, bucket, absent: true }); continue; }
    const row = d.prepare('SELECT * FROM terms WHERE ' + where + ' ORDER BY df,exact_key COLLATE BINARY LIMIT 1 OFFSET ?').get(kind, lo, hi, Math.floor((n - 1) / 2));
    selected.push({ label: kind + '-df-' + bucket, scope: kind.toUpperCase(), query: row.scan_text, match: 'exact', category: 'ID appearance only', selectedDf: row.df, bucket, eligibleTerms: n, selection: 'middle ordinal by df then BINARY exact_key' });
  }
  const contains = ['Monster_W1_Mecha', 'Avatar_Mar_7th', 'Avatar', '拍摄模式', '撮影', 'chụp'].map((query, i) => ({ label: 'contains-' + i, scope: 'STRING', query, match: 'contains', category: 'fixed text' }));
  const rare = d.prepare("SELECT scan_text,df FROM terms WHERE kind='string' AND df=1 AND scan_text GLOB 'Monster_*' ORDER BY exact_key COLLATE BINARY LIMIT 1").get();
  const medium = d.prepare("SELECT scan_text,df FROM terms WHERE kind='string' AND df BETWEEN 6 AND 100 AND scan_text GLOB 'Avatar_*' ORDER BY df,exact_key COLLATE BINARY LIMIT 1").get();
  if (rare) contains.push({ label: 'rare-internal', scope: 'STRING', query: rare.scan_text, match: 'contains', selectedDf: rare.df });
  if (medium) contains.push({ label: 'medium-internal', scope: 'STRING', query: medium.scan_text, match: 'contains', selectedDf: medium.df });
  contains.push({ label: 'common-text', scope: 'STRING', query: '的', match: 'contains' }, { label: 'zero', scope: 'VALUE', query: '__RefAtlas_round2_no_match_20261005_a709__', match: 'contains' }, { label: 'contains-field', scope: 'FIELD', query: 'Avatar', match: 'contains' }, { label: 'contains-number', scope: 'NUMBER', query: '1001', match: 'contains' });
  save('queries.json', { queries: [...fixed, ...selected.filter(q => !q.absent), ...contains], emptyBuckets: selected.filter(q => q.absent), selectionFrozen: true, policy: 'case-sensitive; no NFC/casefold/numeric normalization; continuous code-point boundaries' });
  progress({ stage: 'stats', ...totals, ratio: totals.occurrences / totals.memberships });
} finally { d.close(); }
