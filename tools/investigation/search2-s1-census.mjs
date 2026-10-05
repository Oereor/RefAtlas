// 完整 S1 成功验收后的 census/空间归属；不生成其他候选数据库。
import { db, load, save, root, histSummary, now } from './search2-lib.mjs';
import fs from 'node:fs';
if (!load('controlled-retry/terminal-audit.json').acceptance.fullS1AcceptedForNextGate) throw Error('FULL_S1_GATE_REQUIRED');
await import('./search2-stats.mjs');
const d = db('s1.db', true), c = load('s1.db-census.json'), stats = load('stats.json'), began = now();
try {
  for (const t of d.prepare('SELECT kind,count(*) n FROM terms WHERE df<=20 GROUP BY kind').all()) stats.documentFrequency[t.kind].dfLe20 = t.n;
  const navTypes = {};
  for (const s of c.sources.filter(s => !s.duplicateKeys)) for (const [kind, n] of Object.entries(s.occurrences)) navTypes[kind] = (navTypes[kind] || 0) + n;
  stats.navigableOccurrences = navTypes;
  for (const [kind, t] of Object.entries(stats.typeCompression)) { t.navigableOccurrences = navTypes[kind] || 0; t.navigableRatio = t.navigableOccurrences / t.navigableMemberships; }
  stats.scopes = { raw: 'all 137916 sources, including ambiguous raw facts', navigable: '137901 ready sources, 15 ambiguous sources excluded' };
  stats.logical.membershipSourceIdUint32Bytes = stats.totals.memberships * 4;
  stats.logical.membershipPairUint32Bytes = stats.totals.memberships * 8;
  stats.logical.note = 'fixed-width estimates exclude SQLite page, record, rowid, reverse-access and dictionary overhead; not measured packed DB size';
  const navHist = {};
  for (const row of d.prepare("SELECT t.kind,a.df FROM (SELECT m.term_id,count(*) df FROM memberships m JOIN files f ON f.id=m.source_id WHERE f.state='ready' GROUP BY m.term_id) a JOIN terms t ON t.id=a.term_id").iterate()) { navHist[row.kind] ??= new Map(); navHist[row.kind].set(row.df, (navHist[row.kind].get(row.df) || 0) + 1); }
  stats.navigableDocumentFrequency = Object.fromEntries(Object.entries(navHist).map(([kind, h]) => [kind, { ...histSummary(h), dfLe20: [...h].filter(([df]) => df <= 20).reduce((n, [, count]) => n + count, 0) }]));
  try { stats.dbstat = d.prepare('SELECT name,sum(pgsize) bytes,sum(payload) payload,sum(unused) unused,count(*) pages FROM dbstat GROUP BY name ORDER BY bytes DESC').all(); } catch (e) { stats.dbstat = { unavailable: e.message }; }
  stats.pageCount = d.pragma('page_count', { simple: true }); stats.pageSize = d.pragma('page_size', { simple: true });
  const audit = load('controlled-retry/terminal-audit.json'), dbBytes = stats.pageCount * stats.pageSize;
  stats.spaceComparison = { dbBytes, rawBytes: audit.inputAudit.rawBytes, oldCBytes: 11712999424, dbOverRaw: dbBytes / audit.inputAudit.rawBytes, dbOverOldC: dbBytes / 11712999424, eliminatedOldCBytes: 11712999424 - dbBytes, includesReverseIndex: true, countColumnPresent: true, scopeNote: 'S1 includes ambiguous memberships; old C is navigable only; compare conservative full S1 and report this scope difference' };
  const queries = load('queries.json');
  for (const q of queries.queries.filter(q => q.bucket)) {
    const row = d.prepare('SELECT scan_text FROM terms WHERE kind=? AND df=? AND length(scan_text) BETWEEN 4 AND 20 AND scan_text GLOB \'[1-9][0-9][0-9][0-9]*\' AND scan_text NOT GLOB \'*[^0-9]*\' ORDER BY exact_key COLLATE BINARY LIMIT 1').get(q.scope.toLowerCase(), q.selectedDf);
    q.query = row.scan_text; q.selection = 'median df within frozen bucket; first canonical exact_key in BINARY order at that df';
  }
  queries.queries.push({ label: 'contains-pathlike', scope: 'STRING', query: 'Level/Mission', match: 'contains', category: 'path-like fragment' });
  save('queries.json', queries); stats.additionalAuditWallMs = now() - began; save('stats.json', stats);
  console.log(JSON.stringify({ totals: stats.totals, ratio: stats.ratio, spaceComparison: stats.spaceComparison, dbstat: stats.dbstat, documentFrequency: stats.documentFrequency, cardinalities: stats.cardinalities, additionalAuditWallMs: stats.additionalAuditWallMs, freeBytes: Number(fs.statfsSync(root, { bigint: true }).bavail * fs.statfsSync(root, { bigint: true }).bsize) }));
} finally { d.close(); }
