// 本轮专用基线、单次历史入口复现和监督；不触及生产入口。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { dataRoot, hashFile, samples } from './common.mjs';
import { stamp } from './search-lib.mjs';
export const repo = path.resolve(import.meta.dirname, '../..');
export const root = path.join(import.meta.dirname, 'artifacts/search-round2/execution-lane-closeout');
fs.mkdirSync(root, { recursive: true });
export const save = (name, data) => fs.writeFileSync(path.join(root, name), JSON.stringify(data, null, 2) + '\n');
export const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const git = (dir, ...args) => execFileSync('git', ['-c', 'safe.directory=' + dir.replaceAll('\\', '/'), '-C', dir, ...args], { encoding: 'utf8' }).trim();
export async function baseline() {
  const exact = JSON.parse(fs.readFileSync(path.join(root, '../benchmark-exact.json'))).observations.find(o => o.query.query === '6186714091647966180');
  const contains = JSON.parse(fs.readFileSync(path.join(root, '../benchmark-contains.json'))).observations.find(o => o.query.query === 'Monster_W1_Mecha');
  const exactPaths = [...new Set(exact.runs[0].resolution.examples.map(e => e.path))];
  const containsPaths = [...new Set(contains.runs[0].resolution.examples.map(e => e.path))];
  const buildPaths = ['ExcelOutput/AvatarConfig.json', 'TextMap/TextMapCHS.json', 'ExcelOutput/SpecialAvatarRelicMainValue.json'];
  const paths = [...new Set([...samples, 'TextMap/TextMapJP.json', ...exactPaths, ...containsPaths])];
  const sources = [];
  for (const relative of paths) { const p = path.join(dataRoot, relative); sources.push({ path: relative, bytes: Number(fs.statSync(p, { bigint: true }).size), stamp: stamp(fs.statSync(p, { bigint: true })), sha256: await hashFile(p) }); }
  const expected = [...exact.runs[0].resolution.examples, ...contains.runs[0].resolution.examples];
  for (const e of expected) if (sources.find(s => s.path === e.path).sha256 !== e.fingerprint) throw Error('OLD_EVIDENCE_SOURCE_CHANGED');
  const tracked = git(repo, 'ls-files').split('\n');
  const immutable = tracked.filter(p => p.startsWith('src/') || /(^|\/)(package(-lock)?\.json|.*lock.*)$/.test(p) || ['tools/investigation/search-lib.mjs','tools/investigation/search2-lanes.mjs','tools/investigation/search2-lanes-electron.cjs','tools/investigation/search2-lane.cjs','tools/investigation/search2-lane-work.mjs','docs/investigations/evidence/phase-2-search-candidate-source-controlled-retry.json','docs/investigations/evidence/phase-2-search-candidate-source-measurements.json'].includes(p));
  const disk = fs.statfsSync(root, { bigint: true });
  const result = { measuredAt: new Date().toISOString(), repo: { head: git(repo, 'rev-parse', 'HEAD'), status: git(repo, 'status', '--short') }, external: { head: git(dataRoot, 'rev-parse', 'HEAD'), status: git(dataRoot, 'status', '--short') }, node: process.versions, osBuild: execFileSync('cmd.exe', ['/c', 'ver'], { encoding: 'utf8' }).trim(), electron: JSON.parse(fs.readFileSync(path.join(repo, 'node_modules/electron/package.json'))).version, sqlitePackage: JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'node_modules/better-sqlite3/package.json'))).version, freeBytes: Number(disk.bavail * disk.bsize), reserveBytes: 30 * 1024 ** 3, fingerprints: Object.fromEntries(immutable.map(p => [p, sha(path.join(repo, p))])), sources, workloads: { exactPaths, containsPaths, buildPaths, broadPaths: buildPaths }, fullDatasetBuild: false, searchConcurrency: 1 };
  if (result.freeBytes < result.reserveBytes + 3 * 1024 ** 3) throw Error('RESOURCE_REFUSED');
  return result;
}
export async function run(name, command, args, { timeoutMs = 600000, env = process.env } = {}) {
  const started = Date.now(); const stream = fs.createWriteStream(path.join(root, name + '.log'));
  const child = spawn(command, args, { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let terminatedBySupervisor = false;
  const manifest = { name, command, args, pid: child.pid, startedAt: new Date(started).toISOString(), timeoutMs, automaticRestart: false };
  save(name + '-manifest.json', manifest);
  child.stdout.on('data', b => stream.write(b)); child.stderr.on('data', b => stream.write(b));
  const guard = setTimeout(() => { terminatedBySupervisor = true; child.kill(); }, timeoutMs);
  const diskPeaks = {};
  const sampler = setInterval(() => { for (const n of fs.readdirSync(root).filter(n => /\.db(?:-wal|-shm)?$/.test(n))) { try { diskPeaks[n] = Math.max(diskPeaks[n] || 0, fs.statSync(path.join(root, n)).size); } catch {} } }, 100);
  const result = await new Promise(resolve => { child.on('error', e => resolve({ error: e.message })); child.on('close', (exit, signal) => resolve({ exit, signal })); });
  clearTimeout(guard); clearInterval(sampler); await new Promise(resolve => stream.end(resolve));
  Object.assign(manifest, result, { elapsedMs: Date.now() - started, endedAt: new Date().toISOString(), terminatedBySupervisor, childClosed: true, diskPeaks, diskSamplingMs: 100, unobservedTransientPeaksPossible: true });
  save(name + '-manifest.json', manifest); return manifest;
}
async function reproduce(name = 'original-reproduction') {
  const marker = path.join(root, name + '-manifest.json'); if (fs.existsSync(marker)) throw Error('REPRODUCTION_ALREADY_ATTEMPTED');
  const oldRoot = path.resolve(root, '..'); const names = ['lanes-launch.json', 'lanes.json', 'lanes-failure.json'];
  const backups = names.map(name => ({ name, bytes: fs.existsSync(path.join(oldRoot, name)) ? fs.readFileSync(path.join(oldRoot, name)) : null }));
  for (const b of backups) if (b.bytes) fs.writeFileSync(path.join(root, 'historical-' + b.name), b.bytes);
  if (fs.existsSync(path.join(oldRoot, 's1.db')) || fs.existsSync(path.join(oldRoot, 'baseline.json'))) throw Error('UNEXPECTED_OLD_WORKLOAD_INPUT');
  try {
    const result = await run(name, process.execPath, ['tools/investigation/search2-lanes.mjs']);
    for (const n of names) if (fs.existsSync(path.join(oldRoot, n))) fs.copyFileSync(path.join(oldRoot, n), path.join(root, name + '-' + n));
    const log = fs.readFileSync(path.join(root, name + '.log'), 'utf8');
    const launch = JSON.parse(fs.readFileSync(path.join(root, name + '-lanes-launch.json')));
    save(name === 'original-reproduction' ? 'reproduction-review.json' : 'recovery-review.json', { result, launch, sameAclFatal: launch.exit === 2147483651 && /install_dir_access\.cc/.test(log) && /ALL APPLICATION PACKAGES/.test(log), noFullSearchInput: true });
  } finally {
    for (const b of backups) { const p = path.join(oldRoot, b.name); if (b.bytes) fs.writeFileSync(p, b.bytes); else if (fs.existsSync(p)) fs.unlinkSync(p); }
    save('historical-restoration.json', backups.map(b => ({ name: b.name, restored: b.bytes ? sha(path.join(oldRoot, b.name)) === createHash('sha256').update(b.bytes).digest('hex') : !fs.existsSync(path.join(oldRoot, b.name)) })));
  }
}
if (process.argv[1] === import.meta.filename) {
  const action = process.argv[2];
  if (action === 'baseline') { save('baseline.json', await baseline()); console.log('baseline saved'); }
  else if (action === 'reproduce') { await reproduce(); console.log('single reproduction captured; historical files restored'); }
  else if (action === 'recovery-owner') { save('owner-runtime.json', { identity: execFileSync('whoami', [], { encoding: 'utf8' }).trim(), node: process.versions }); await reproduce('original-recovery-owner'); console.log('owner-context recovery captured'); }
  else if (action === 'audit') { const before = JSON.parse(fs.readFileSync(path.join(root, 'baseline.json'))), after = await baseline(); save('final-input-audit.json', { sourcesUnchanged: JSON.stringify(before.sources) === JSON.stringify(after.sources), immutableUnchanged: JSON.stringify(before.fingerprints) === JSON.stringify(after.fingerprints), externalUnchanged: JSON.stringify(before.external) === JSON.stringify(after.external), after }); }
  else if (action === 'smoke' || action === 'smoke-owner') { const result = await run(action === 'smoke' ? 'ordinary-built-smoke' : 'ordinary-built-smoke-owner', process.execPath, ['scripts/smoke-worker.mjs', 'built', root], { timeoutMs: 120000 }); if (result.exit !== 0) process.exitCode = 1; }
  else if (action === 'lanes') {
    if (fs.existsSync(path.join(root, 'lane-suite-manifest.json'))) throw Error('LANE_SUITE_ALREADY_STARTED');
    const smoke = JSON.parse(fs.readFileSync(path.join(root, 'report.json')));
    if (!smoke.ok || !smoke.security.sandbox || !smoke.security.contextIsolation || smoke.security.nodeIntegration) throw Error('SANDBOX_GATE_REQUIRED');
    const { build } = await import('esbuild');
    await build({ entryPoints: [path.join(repo,'src/utility/raw-service.ts')], outfile: path.join(root,'production.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node24', logLevel: 'warning' });
    save('lane-tool-fingerprints.json', { measuredAt: new Date().toISOString(), tools: Object.fromEntries(['search2-closeout.mjs','search2-closeout-work.mjs','search2-closeout-lane.cjs','search2-closeout-electron.cjs','search2-resolve.mjs','search-lib.mjs'].map(n => [n,sha(path.join(import.meta.dirname,n))])), compiledRawService: sha(path.join(root,'production.cjs')), security: smoke.security });
    const env = { ...process.env, ELECTRON_NO_ATTACH_CONSOLE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
    const result = await run('lane-suite', path.join(repo,'node_modules/electron/dist/electron.exe'), [path.join(import.meta.dirname,'search2-closeout-electron.cjs')], { env, timeoutMs: 660000 });
    if (result.exit !== 0) process.exitCode = 1;
  }
  else if (action === 'failure-recovery-addendum') {
    const lanes = JSON.parse(fs.readFileSync(path.join(root,'lanes.json')));
    if (!lanes.passed || lanes.exits.some(e => e.code !== e.expected)) throw Error('KNOWN_TERMINAL_REQUIRED');
    const pid = lanes.runtimes.find(r=>r.role==='search').pid;
    const { recoverFailureFiles } = await import('./search2-closeout-work.mjs');
    const recorded = lanes.records.find(r=>r.phase==='controlled-failure'&&r.mode==='dedicated-utility').recovery;
    const recovery = recorded.length ? recorded : recoverFailureFiles(pid);
    if (recovery.length !== 1 || recovery[0].recovery.quickCheck !== 'ok' || recovery[0].recovery.state !== 'staging') throw Error('FAILED_UTILITY_RECOVERY_UNPROVEN');
    save('controlled-failure-recovery-addendum.json', { passed:true,measuredAt:new Date().toISOString(),pid,recovery,alreadyAuditedInRun:Boolean(recorded.length),originalRunPreserved:true,reason:'Electron UtilityProcess.pid is undefined after exit; use captured ready PID; corrected harness caches PID before exit' });
    console.log('known-exit DB recovered, staging unpubished, removed');
  }
  else if (action === 'probes') {
    const lanes=JSON.parse(fs.readFileSync(path.join(root,'lanes.json')));
    if (!lanes.passed || lanes.exits.some(e=>e.code!==e.expected) || fs.existsSync(path.join(root,'corrected-probes-manifest.json'))) throw Error('PROBE_GATE');
    const env={...process.env,ELECTRON_NO_ATTACH_CONSOLE:'1'};delete env.ELECTRON_RUN_AS_NODE;
    save('corrected-probes-tools.json',{main:sha(path.join(import.meta.dirname,'search2-closeout-electron.cjs')),lane:sha(path.join(import.meta.dirname,'search2-closeout-lane.cjs')),reason:'monitor warmup; fixed probes only'});
    const result=await run('corrected-probes',path.join(repo,'node_modules/electron/dist/electron.exe'),[path.join(import.meta.dirname,'search2-closeout-electron.cjs'),'--probes-only'],{env,timeoutMs:120000});
    if(result.exit!==0)process.exitCode=1;
  }
  else throw Error('ACTION');
}
