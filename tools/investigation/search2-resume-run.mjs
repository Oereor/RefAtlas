// 成功验收后的单阶段监督；任何失败即停止，不自动恢复、重启或重放。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const toolRoot = import.meta.dirname, root = path.join(toolRoot, 'artifacts/search-round2');
const retryRoot = path.join(root, 'controlled-retry');
const acceptance = JSON.parse(fs.readFileSync(path.join(retryRoot, 'terminal-audit.json'))).acceptance;
if (!acceptance.fullS1AcceptedForNextGate) throw Error('RESUME_GATE_NOT_PASSED');
const file = process.argv[2];
if (!/^search2-[a-z0-9-]+\.mjs$/.test(file || '') || ['search2-build.mjs', 'search2-retry.mjs', 'search2-run.mjs', 'search2-resume-run.mjs'].includes(file)) throw Error('INVALID_STAGE_NO_S1_RETRY');
const pipelinePath = path.join(retryRoot, 'resume-stages.json');
const history = fs.existsSync(pipelinePath) ? JSON.parse(fs.readFileSync(pipelinePath)) : [];
// 已查明的非原生调查工具错误只允许显式修复后的新阶段；原失败终态不改写。
const repaired = history.filter(s => s.exit !== 0).every(s => s.childClosed && ((s.ordinal === 11 && s.file === 'search2-space.mjs' && s.exit === 1 && fs.existsSync(path.join(retryRoot,'space-tool-failure.json')) && JSON.parse(fs.readFileSync(path.join(retryRoot,'space-tool-failure.json'))).nativeCrash === false) || (s.ordinal === 12 && s.file === 'search2-hash.mjs' && fs.existsSync(path.join(retryRoot,'hash-tool-intervention.json')) && JSON.parse(fs.readFileSync(path.join(retryRoot,'hash-tool-intervention.json'))).knownHarnessIntervention === true)));
if (history.some(s => !s.childClosed) || !repaired) throw Error('PREVIOUS_STAGE_FAILED_STOP');
if (history.some(s => s.file === file && JSON.stringify(s.args) === JSON.stringify(process.argv.slice(3)))) throw Error('STAGE_ALREADY_EXECUTED_NO_REPLAY');
const record = { ordinal: history.length + 1, file, args: process.argv.slice(3), startTime: new Date().toISOString(), childClosed: false, phase: 'STARTING', diskPeaks: {}, rssCheckpointMax: 0, guardMs: 45 * 60 * 1000, sampleMs: 100, automaticRestart: false };
record.toolSha256 = createHash('sha256').update(fs.readFileSync(path.join(toolRoot,file))).digest('hex');
const save = () => fs.writeFileSync(pipelinePath, JSON.stringify(history, null, 2) + '\n');
history.push(record); save();
const began = performance.now(), log = path.join(retryRoot, `${record.ordinal}-${file}.log`), fd = fs.openSync(log, 'wx');
const child = spawn(process.execPath, ['--max-old-space-size=1024', path.join(toolRoot, file), ...record.args], { cwd: toolRoot, windowsHide: true, stdio: ['ignore', fd, fd, 'ipc'], env: { ...process.env, TMP: path.join(root, 'sqlite-temp'), TEMP: path.join(root, 'sqlite-temp'), SQLITE_TMPDIR: path.join(root, 'sqlite-temp') } });
record.childPid = child.pid; record.phase = 'RUNNING'; save();
const sample = () => { for (const directory of [root, path.join(root, 'sqlite-temp')]) for (const name of fs.readdirSync(directory)) { try { const p = path.join(directory, name), s = fs.statSync(p); if (s.isFile() && /\.db(?:-(?:wal|shm|journal))?$/.test(name)) { const key = path.relative(root, p); record.diskPeaks[key] = Math.max(record.diskPeaks[key] || 0, s.size); } } catch { /* 短暂文件 */ } } };
child.on('message', m => { record.lastCheckpoint = m; record.rssCheckpointMax = Math.max(record.rssCheckpointMax, m.rss || 0); });
const sampler = setInterval(sample, 100);
const heartbeat = setInterval(() => { record.elapsedMs = performance.now() - began; save(); console.log(JSON.stringify({ file, elapsedMs: record.elapsedMs, lastCheckpoint: record.lastCheckpoint, rssCheckpointMax: record.rssCheckpointMax })); }, 30000);
const guard = setTimeout(() => { record.supervisorTermination = '45_MINUTE_GUARD'; child.kill(); }, record.guardMs);
process.on('SIGINT', () => { record.supervisorTermination = 'SIGINT'; child.kill('SIGINT'); });
try {
  const terminal = await new Promise(resolve => {
    child.on('error', e => { record.spawnError = e.message; });
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  Object.assign(record, { ...terminal, exit: terminal.code, exitHex: terminal.code == null ? null : '0x' + (terminal.code >>> 0).toString(16).toUpperCase(), childClosed: true, phase: terminal.code === 0 ? 'COMPLETED' : 'FAILED_STOP', endTime: new Date().toISOString(), elapsedMs: performance.now() - began });
  sample(); if (terminal.code !== 0) process.exitCode = 1;
} finally { clearInterval(sampler); clearInterval(heartbeat); clearTimeout(guard); fs.closeSync(fd); save(); }
console.log(JSON.stringify(record));
