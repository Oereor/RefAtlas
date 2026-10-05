// 唯一一次已授权的受控 Attempt #2。builder 不修改；额外诊断仅在监督进程。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { dataRoot, environment, gitState, samples, hashFile } from './common.mjs';

const toolRoot = import.meta.dirname, appRoot = path.resolve(toolRoot, '../..');
const owned = path.join(toolRoot, 'artifacts/search-round2');
const retryRoot = path.join(owned, 'controlled-retry');
fs.mkdirSync(retryRoot, { recursive: true });
if (fs.realpathSync(owned) !== owned || fs.realpathSync(retryRoot) !== retryRoot) throw Error('OWNED_ROOT_SYMLINK');
const manifestPath = path.join(retryRoot, 'attempt-2.json');
if (fs.existsSync(manifestPath)) throw Error('ATTEMPT_2_ALREADY_RECORDED_NO_RETRY');
const sha = b => createHash('sha256').update(b).digest('hex');
const git = args => execFileSync('git', args, { cwd: appRoot, encoding: 'utf8' }).trim();
const write = (name, value) => fs.writeFileSync(path.join(retryRoot, name), JSON.stringify(value, null, 2) + '\n');
const previous = JSON.parse(fs.readFileSync(path.join(appRoot, 'docs/investigations/evidence/phase-2-search-candidate-source-measurements.json')));
const scannerPath = path.join(toolRoot, 'search-lib.mjs'), originalScanner = fs.readFileSync(scannerPath);
const attempt1Scanner = execFileSync('git', ['show', 'c3a3702:tools/investigation/search-lib.mjs'], { cwd: appRoot });
if (originalScanner.toString().replace("kind: 'field', valueKind: kind, pointer", "kind: 'field', pointer") !== attempt1Scanner.toString()) throw Error('UNEXPLAINED_SCANNER_DIFFERENCE');
for (const name of ['search2-build.mjs', 'search2-lib.mjs', 'common.mjs']) {
  if (!fs.readFileSync(path.join(toolRoot, name)).equals(execFileSync('git', ['show', `accf168:tools/investigation/${name}`], { cwd: appRoot }))) throw Error('INPUT_CHANGED:' + name);
}
if (git(['status', '--porcelain=v1', '--', 'src', 'package.json', 'package-lock.json', 'tools/investigation/package.json', 'tools/investigation/package-lock.json'])) throw Error('PRODUCTION_OR_DEPENDENCIES_CHANGED');
for (const n of ['s1.db', 's1-staging.db', 's1.db-wal', 's1.db-shm', 's1-staging.db-wal', 's1-staging.db-shm', 's1.db-build.json', 's1.db-census.json', 'baseline.json']) if (fs.existsSync(path.join(owned, n))) throw Error('NONEMPTY_ATTEMPT_OUTPUT:' + n);
const versionDb = new Database(':memory:');
const sqlite = versionDb.prepare('SELECT sqlite_version() v').get().v; versionDb.close();
const driver = JSON.parse(fs.readFileSync(path.join(toolRoot, 'node_modules/better-sqlite3/package.json'))).version;
const statfs = fs.statfsSync(owned, { bigint: true }), freeBytes = Number(statfs.bavail * statfs.bsize);
if (process.version !== 'v24.21.0' || process.arch !== 'x64' || os.release() !== '10.0.26300' || driver !== '13.0.3' || sqlite !== '3.53.4' || process.env.NODE_OPTIONS) throw Error('ENVIRONMENT_NOT_EQUIVALENT');
if (freeBytes < 42 * 1024 ** 3) throw Error('DISK_SAFETY_STOP');
async function sourceAudit() {
  const fingerprints = [];
  for (const relative of [...samples, 'TextMap/TextMapJP.json']) {
    const filename = path.join(dataRoot, relative), s = fs.statSync(filename, { bigint: true });
    fingerprints.push({ path: relative, sha256: await hashFile(filename), stamp: [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':') });
  }
  return { repository: gitState(), fingerprints };
}
const sourceBefore = await sourceAudit();
if (JSON.stringify(sourceBefore.repository) !== JSON.stringify(previous.baseline.repository) || JSON.stringify(sourceBefore.fingerprints) !== JSON.stringify(previous.baseline.fingerprints)) throw Error('DATASET_BASELINE_CHANGED');
const oldArtifactNames = fs.readdirSync(owned).filter(n => fs.statSync(path.join(owned, n)).isFile());
const priorArtifacts = oldArtifactNames.map(name => ({ name, bytes: fs.statSync(path.join(owned, name)).size, sha256: sha(fs.readFileSync(path.join(owned, name))) }));
const oldProgressPath = path.join(owned, 's1.db-progress.json'), oldProgress = fs.existsSync(oldProgressPath) ? fs.readFileSync(oldProgressPath) : null;
fs.writeFileSync(path.join(retryRoot, 'scanner-current-before.mjs'), originalScanner);
fs.writeFileSync(path.join(retryRoot, 'scanner-attempt1.mjs'), attempt1Scanner);
const inputFiles = ['search2-build.mjs', 'search2-lib.mjs', 'common.mjs', 'package.json', 'package-lock.json'].map(name => ({ name, sha256: sha(fs.readFileSync(path.join(toolRoot, name))) }));
const argv = ['--max-old-space-size=1024', path.join(toolRoot, 'search2-build.mjs')];
const manifest = { attempt: 2, phase: 'PREPARED', rootCause: 'UNKNOWN', startTime: new Date().toISOString(), applicationHead: git(['rev-parse', 'HEAD']), applicationStatus: git(['status', '--short']), sourceBefore, environment: { ...environment(), driver, sqlite, freeBytes, nodeOptions: process.env.NODE_OPTIONS || null }, inputFiles, scanner: { currentBeforeSha256: sha(originalScanner), attempt1GitBlobSha256: sha(attempt1Scanner), restorationReason: 'FIELD valueKind was added after Attempt #1 had loaded this scanner; restore actual loaded code', byteEquivalentToC3a3702: true }, executable: process.execPath, argv, cwd: toolRoot, childConcurrency: 1, samplingMs: 100, diagnosticIntervalMs: 30000, guardMs: 45 * 60 * 1000, temp: path.join(owned, 'sqlite-temp'), priorArtifacts, noAutomaticRestart: true };
write('attempt-2.json', manifest);
const began = performance.now(), peaks = {}; let child, lastCheckpoint, lastCompletedBatch, rssMax = 0, guardTimer, sampler, heartbeat, logFd, childClosed = false, terminationReason = null;
function diskSample() {
  for (const directory of [owned, manifest.temp]) for (const name of fs.readdirSync(directory)) {
    try { const p = path.join(directory, name); if (fs.statSync(p).isFile() && /\.(?:db|json)$|\.db-(?:wal|shm|journal)$/.test(name)) { const k = path.relative(owned, p); peaks[k] = Math.max(peaks[k] || 0, fs.statSync(p).size); } } catch { /* transient file already closed */ }
  }
}
function diagnostic() {
  const t = performance.now(); let observed;
  const p = path.join(owned, 's1.db');
  if (fs.existsSync(p)) {
    let d;
    try {
      d = new Database(p, { readonly: true, timeout: 50 }); d.exec('BEGIN');
      observed = { lastCatalogSource: d.prepare('SELECT id,path,state,bytes FROM files ORDER BY id DESC LIMIT 1').get(), lastCompletedSource: d.prepare("SELECT id,path,state FROM files WHERE state IN ('ready','ambiguous') ORDER BY id DESC LIMIT 1").get(), highestTermIdAppendOnlyEstimate: d.prepare('SELECT id FROM terms ORDER BY id DESC LIMIT 1').get()?.id, readySourceCount: d.prepare("SELECT count(*) n FROM files WHERE state='ready'").get().n };
      d.exec('COMMIT');
    } catch (e) { observed = { diagnosticUnavailable: e.message }; }
    finally { if (d?.inTransaction) d.exec('ROLLBACK'); d?.close(); }
  }
  const record = { timestamp: new Date().toISOString(), elapsedMs: performance.now() - began, sourceTotal: previous.baseline.sourceCount, lastCheckpoint, lastCompletedBatch, rssCheckpointMax: rssMax, catalog: observed, diagnosticMs: performance.now() - t, dbBytes: fs.existsSync(p) ? fs.statSync(p).size : 0, walBytes: fs.existsSync(p + '-wal') ? fs.statSync(p + '-wal').size : 0 };
  fs.appendFileSync(path.join(retryRoot, 'checkpoints.jsonl'), JSON.stringify(record) + '\n');
  write('last-checkpoint.json', record); console.log(JSON.stringify(record));
}
try {
  fs.writeFileSync(scannerPath, attempt1Scanner);
  manifest.scanner.loadedInputSha256 = sha(fs.readFileSync(scannerPath));
  fs.mkdirSync(manifest.temp, { recursive: true });
  logFd = fs.openSync(path.join(retryRoot, 'attempt-2-build.log'), 'wx');
  manifest.phase = 'STARTING'; write('attempt-2.json', manifest);
  child = spawn(process.execPath, argv, { cwd: toolRoot, windowsHide: true, stdio: ['ignore', logFd, logFd, 'ipc'], env: { ...process.env, TMP: manifest.temp, TEMP: manifest.temp, SQLITE_TMPDIR: manifest.temp } });
  manifest.childPid = child.pid; manifest.phase = 'RUNNING'; write('attempt-2.json', manifest);
  child.on('message', m => { if (m.type === 'metrics') { rssMax = Math.max(rssMax, m.rss || 0); lastCheckpoint = m; if (!Object.hasOwn(m, 'elapsedSeconds')) lastCompletedBatch = m; } });
  sampler = setInterval(diskSample, 100); heartbeat = setInterval(diagnostic, 30000);
  guardTimer = setTimeout(() => { terminationReason = 'SUPERVISOR_45_MINUTE_GUARD'; child.kill(); }, manifest.guardMs);
  process.on('SIGINT', () => { terminationReason = 'SUPERVISOR_SIGINT'; child.kill('SIGINT'); });
  const terminal = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code, signal) => { childClosed = true; resolve({ code, signal }); }); });
  clearInterval(sampler); clearInterval(heartbeat); clearTimeout(guardTimer); diskSample(); diagnostic();
  manifest.phase = terminal.code === 0 ? 'EXIT_ZERO_AWAITING_AUDIT' : 'STOPPED';
  Object.assign(manifest, { exit: terminal.code, exitHex: terminal.code == null ? null : '0x' + (terminal.code >>> 0).toString(16).toUpperCase(), signal: terminal.signal, terminationReason, childClosed, elapsedMs: performance.now() - began, lastCheckpoint, lastCompletedBatch, rssCheckpointsMax: rssMax, sampledDiskHighWater: peaks, samplingLimitation: 'named files/checkpoints only; peaks need not coincide; no OS cache control' });
  if (terminal.code !== 0) process.exitCode = 1;
} catch (e) {
  manifest.phase = 'SUPERVISOR_FAILURE'; manifest.supervisorError = e.stack;
  if (child && !childClosed) { terminationReason = 'SUPERVISOR_FAILURE'; child.kill(); await new Promise(resolve => child.once('close', () => { childClosed = true; resolve(); })); }
  manifest.childClosed = childClosed; manifest.terminationReason = terminationReason; process.exitCode = 1;
} finally {
  clearInterval(sampler); clearInterval(heartbeat); clearTimeout(guardTimer); if (logFd !== undefined) fs.closeSync(logFd);
  fs.writeFileSync(scannerPath, originalScanner); manifest.scanner.restoredSha256 = sha(fs.readFileSync(scannerPath)); manifest.scanner.restored = manifest.scanner.restoredSha256 === manifest.scanner.currentBeforeSha256;
  if (fs.existsSync(oldProgressPath)) fs.copyFileSync(oldProgressPath, path.join(retryRoot, 'attempt-2-progress.json'));
  if (oldProgress) fs.writeFileSync(oldProgressPath, oldProgress);
  manifest.endTime = new Date().toISOString(); write('attempt-2.json', manifest);
  if (!manifest.scanner.restored) throw Error('SCANNER_RESTORATION_FAILED');
}
console.log(JSON.stringify({ phase: manifest.phase, exit: manifest.exit, exitHex: manifest.exitHex, elapsedMs: manifest.elapsedMs, scannerRestored: manifest.scanner.restored, childClosed: manifest.childClosed }));
