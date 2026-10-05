// Attempt #2 结束后的只读审计；不扫描 occurrence，不修复或恢复失败库。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { db, load, root, audit, inventory, disk } from './search2-lib.mjs';

const appRoot = path.resolve(import.meta.dirname, '../..');
const retryRoot = path.join(root, 'controlled-retry');
const manifest = JSON.parse(fs.readFileSync(path.join(retryRoot, 'attempt-2.json')));
if (!manifest.childClosed || !manifest.scanner.restored || manifest.phase === 'RUNNING') throw Error('ATTEMPT_NOT_TERMINAL');
const sha = b => createHash('sha256').update(b).digest('hex');
const git = args => execFileSync('git', args, { cwd: appRoot, encoding: 'utf8' }).trim();
const baseline = load('baseline.json'), old = load('failure-forensic.json');
process.env.SQLITE_TMPDIR = process.env.TMP = process.env.TEMP = path.join(root, 'sqlite-temp');
const d = db('s1.db', true);
let database;
try {
  database = {
    integrity: d.pragma('quick_check'),
    states: d.prepare('SELECT state,count(*) sources,sum(bytes) sourceBytes FROM files GROUP BY state').all(),
    memberships: d.prepare('SELECT count(*) n,sum(n) occurrences FROM memberships').get(),
    terms: d.prepare('SELECT count(*) n,sum(df) dfs,sum(occurrences) occurrences FROM terms').get(),
    lastSources: d.prepare('SELECT * FROM files ORDER BY id DESC LIMIT 6').all(),
    building: d.prepare("SELECT * FROM files WHERE state='building' ORDER BY id").all(),
    schema: d.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all(),
    disk: disk('s1.db'), stagingDisk: disk('s1-staging.db'),
    pageCount: d.pragma('page_count', { simple: true }), pageSize: d.pragma('page_size', { simple: true }),
    freelistCount: d.pragma('freelist_count', { simple: true }),
  };
  if (manifest.exit === 0) {
    const census = load('s1.db-census.json'), build = load('s1.db-build.json');
    database.censusTypeCounters = d.prepare('SELECT t.kind,count(*) memberships,sum(m.n) occurrences FROM memberships m JOIN terms t ON t.id=m.term_id GROUP BY t.kind').all();
    const sourceCounters = d.prepare('SELECT source_id,count(*) memberships,sum(n) occurrences FROM memberships GROUP BY source_id').all();
    const catalogs = d.prepare('SELECT * FROM files ORDER BY id').all();
    database.sourceCensusConsistent = census.errors.length === 0 && census.sources.length === 137916 && catalogs.every((f, i) => {
      const s = census.sources[i], b = baseline.files[i];
      return f.id === s.id && f.path === s.path && f.path === b.path && f.bytes === s.bytes && f.bytes === b.bytes && f.stamp === b.stamp && f.sha256 === s.sha256 && f.state === (s.duplicateKeys ? 'ambiguous' : 'ready');
    });
    const counterMap = new Map(sourceCounters.map(s => [s.source_id, s]));
    database.sourceCensusConsistent &&= census.sources.every(s => {
      const actual = counterMap.get(s.id);
      return (actual?.memberships || 0) === Object.values(s.counts).reduce((n, v) => n + v, 0) && (actual?.occurrences || 0) === Object.values(s.occurrences).reduce((n, v) => n + v, 0);
    });
    database.typeCensusConsistent = database.censusTypeCounters.every(t => t.memberships === census.rawMemberships[t.kind] && t.occurrences === census.rawOccurrences[t.kind]);
    database.buildCountersConsistent = build.completed && build.files === 137916 && build.memberships === database.memberships.n && build.terms === database.terms.n;
    database.round1RawOccurrencesConsistent = database.memberships.occurrences === 83533059;
    database.termCounterMismatches = d.prepare('SELECT count(*) n FROM (SELECT term_id,count(*) df,sum(n) occurrences FROM memberships GROUP BY term_id) a JOIN terms t ON t.id=a.term_id WHERE a.df<>t.df OR a.occurrences<>t.occurrences').get().n;
  }
} finally { d.close(); }
const after = await audit(), files = await inventory();
const metadataUnchanged = files.length === baseline.files.length && files.every((f, i) => f.path === baseline.files[i].path && f.stamp === baseline.files[i].stamp && f.bytes === baseline.files[i].bytes);
const externalUnchanged = metadataUnchanged && JSON.stringify(after.repository) === JSON.stringify(baseline.repository) && JSON.stringify(after.fingerprints) === JSON.stringify(baseline.fingerprints);
const productionStatus = git(['status', '--porcelain=v1', '--', 'src', 'package.json', 'package-lock.json', 'tools/investigation/package.json', 'tools/investigation/package-lock.json']);
const inputFilesUnchanged = manifest.inputFiles.every(f => sha(fs.readFileSync(path.join(import.meta.dirname, f.name))) === f.sha256);
const scannerRestored = sha(fs.readFileSync(path.join(import.meta.dirname, 'search-lib.mjs'))) === manifest.scanner.currentBeforeSha256;
const priorArtifacts = manifest.priorArtifacts.map(f => ({ name: f.name, unchanged: fs.existsSync(path.join(root, f.name)) && sha(fs.readFileSync(path.join(root, f.name))) === f.sha256 }));
const oldBuilding = old.lastSources.find(f => f.state === 'building');
const currentBuilding = database.building[0];
const sourceCount = database.states.reduce((n, s) => n + s.sources, 0);
const expectedFullStates = sourceCount === 137916 && database.states.find(s => s.state === 'ready')?.sources === 137901 && database.states.find(s => s.state === 'ambiguous')?.sources === 15 && database.states.every(s => ['ready', 'ambiguous'].includes(s.state));
const termCountersConsistent = database.terms.dfs === database.memberships.n && database.terms.occurrences === database.memberships.occurrences;
const integrityOK = database.integrity.length === 1 && database.integrity[0].quick_check === 'ok';
const fullS1AcceptedForNextGate = manifest.exit === 0 && expectedFullStates && termCountersConsistent && database.termCounterMismatches === 0 && database.sourceCensusConsistent && database.typeCensusConsistent && database.buildCountersConsistent && database.round1RawOccurrencesConsistent && integrityOK && externalUnchanged && !productionStatus && scannerRestored && inputFilesUnchanged;
const result = {
  attempt: 2, checkedAt: new Date().toISOString(), manifest, database,
  comparison: { attempt1: { exit: old.nativeExitDecimal, exitHex: old.nativeExitHex, supervisorElapsedMs: 127122.288, readySources: old.states.find(s => s.state === 'ready')?.sources, buildingSource: oldBuilding, memberships: old.memberships, terms: old.termCount }, sameExitCode: manifest.exit === old.nativeExitDecimal, sameBuildingPath: currentBuilding?.path === oldBuilding?.path, buildingOrdinalDelta: currentBuilding ? currentBuilding.id - oldBuilding.id : null, rootCause: 'UNKNOWN; locality/exit comparison does not identify a defective component' },
  acceptance: { fullS1AcceptedForNextGate, expectedFullStates, termCountersConsistent, integrityOK, sourceCount, noCompleteCensusOnFailure: manifest.exit !== 0 },
  inputAudit: { externalUnchanged, metadataUnchanged, sourceCount: files.length, rawBytes: files.reduce((n, f) => n + f.bytes, 0), representativeAudit: after, productionStatus, productionUnchanged: !productionStatus, inputFilesUnchanged, scannerRestored, priorArtifacts, priorArtifactsUnchanged: priorArtifacts.every(f => f.unchanged), applicationHead: git(['rev-parse', 'HEAD']) },
  allAuditDbHandlesClosed: true, noOccurrenceTruthDatabase: true,
};
fs.writeFileSync(path.join(retryRoot, 'terminal-audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ exit: manifest.exit, acceptance: result.acceptance, database, inputAudit: { externalUnchanged, metadataUnchanged, scannerRestored, inputFilesUnchanged, priorArtifactsUnchanged: result.inputAudit.priorArtifactsUnchanged, productionUnchanged: !productionStatus } }));
if (!externalUnchanged || productionStatus || !scannerRestored || !inputFilesUnchanged || !result.inputAudit.priorArtifactsUnchanged || !integrityOK || (manifest.exit === 0 && !fullS1AcceptedForNextGate)) process.exitCode = 1;
