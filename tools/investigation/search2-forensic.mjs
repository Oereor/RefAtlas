// Minimal read-only crash forensic; never resumes or repairs the partial candidate.
import fs from 'node:fs';
import path from 'node:path';
import { db, load, save, output, scan, typedKey, dataRoot, disk, now, audit, inventory } from './search2-lib.mjs';
const started = now(), d = db('s1.db', true), baseline = load('baseline.json');
try {
  const last = d.prepare('SELECT * FROM files ORDER BY id DESC LIMIT 6').all();
  const integrity = d.pragma('quick_check');
  const states = d.prepare('SELECT state,count(*) sources,sum(bytes) sourceBytes FROM files GROUP BY state').all();
  const memberships = d.prepare('SELECT count(*) n,sum(n) occurrences FROM memberships').get();
  const termCount = d.prepare('SELECT count(*) n FROM terms').get().n;
  const recovery = [];
  for (const file of last) {
    const observed = new Map(), parsed = await scan(path.join(dataRoot, file.path), { allowDuplicateKeys: true, onFact(f) { const k = typedKey(f); observed.set(k, (observed.get(k) || 0) + 1); } });
    const indexed = d.prepare('SELECT t.class,t.kind,t.exact_key,m.n FROM memberships m JOIN terms t ON t.id=m.term_id WHERE m.source_id=?').all(file.id);
    let different = 0;
    for (const t of indexed) if (observed.get(JSON.stringify([t.class, t.kind, t.exact_key])) !== t.n) different++;
    recovery.push({ path: file.path, state: file.state, rawScanSucceeded: true, rawMemberships: observed.size, indexedMemberships: indexed.length, differingPresentMemberships: different, publishedSetEqual: file.state !== 'building' && different === 0 && observed.size === indexed.length, sha256: parsed.sha256, baselineStampMatches: parsed.stamp === baseline.files.find(f => f.path === file.path)?.stamp, duplicateKeys: parsed.duplicateKeys });
  }
  const after = await audit(), files = await inventory();
  const metadataUnchanged = files.length === baseline.files.length && files.every((f, i) => f.path === baseline.files[i].path && f.stamp === baseline.files[i].stamp && f.bytes === baseline.files[i].bytes);
  const externalUnchanged = metadataUnchanged && JSON.stringify(after.repository) === JSON.stringify(baseline.repository) && JSON.stringify(after.fingerprints) === JSON.stringify(baseline.fingerprints);
  const evidence = { stopCondition: 'native crash in non-FTS candidate path', fullDatasetComplete: false, nativeExitDecimal: 3221226505, nativeExitHex: '0xC0000409', rootCause: 'NOT ESTABLISHED; exit code alone does not identify defective component', restartAttempted: false, schema: d.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all(), integrity, states, memberships, termCount, lastSources: last, lastSourceReadOnlyProbes: recovery, disk: disk('s1.db'), stagingDisk: disk('s1-staging.db'), sourceAudit: { externalUnchanged, metadataUnchanged, sourceCount: files.length, repository: after.repository, fingerprints: after.fingerprints }, wallMs: now() - started, noCompleteCandidateSizeOrTiming: true };
  save('failure-forensic.json', evidence); console.log(JSON.stringify(evidence));
  if (!externalUnchanged || integrity[0].quick_check !== 'ok') process.exitCode = 1;
} finally { d.close(); }
