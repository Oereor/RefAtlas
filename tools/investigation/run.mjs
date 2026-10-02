import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toolRoot, samples, benchmarkSamples, sourcePath, hashFile, gitState, environment, writeArtifact, artifactsRoot } from './common.mjs';

export function runIsolated(mode, relative, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000;
  const rssLimitBytes = options.rssLimitBytes ?? 2 * 1024 ** 3;
  if (os.freemem() < 3 * 1024 ** 3) return Promise.resolve({ mode, path: relative, status: 'skipped', reason: '可用内存低于 3 GiB，跳过实验' });
  return new Promise(resolve => {
    let result;
    let failure;
    let observedRssBytes = 0;
    const child = fork(options.script ?? path.join(toolRoot, 'child.mjs'), [mode, relative], {
      execArgv: ['--max-old-space-size=1024'], stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    let stderr = '';
    child.stdout.resume();
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8000); });
    const stop = reason => { failure ??= reason; child.kill(); };
    const timeout = setTimeout(() => stop('超过单次实验时间限制'), timeoutMs);
    let monitor;
    if (process.platform === 'win32') {
      const command = `$ErrorActionPreference='SilentlyContinue'; while($true){$process=Get-Process -Id ${child.pid}; if(-not $process){break}; Write-Output $process.WorkingSet64; Start-Sleep -Milliseconds 100}`;
      monitor = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      let pending = '';
      monitor.stdout.on('data', chunk => {
        pending += chunk;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop();
        for (const line of lines) {
          const rss = Number(line.trim());
          if (Number.isFinite(rss)) { observedRssBytes = Math.max(observedRssBytes, rss); if (rss > rssLimitBytes) stop('RSS 超过保护阈值'); }
        }
      });
      monitor.on('error', error => { stderr += '\n外部 RSS 监测不可用：' + error.message; });
    }
    child.on('message', message => {
      if (message.kind === 'result') result = message.result;
      if (message.kind === 'failure') failure = message.message;
      if (message.kind === 'memory') {
        observedRssBytes = Math.max(observedRssBytes, message.rssBytes);
        if (message.rssBytes > rssLimitBytes) stop('RSS 超过保护阈值');
      }
    });
    child.on('error', error => { failure = error.message; });
    child.on('close', (code, signal) => {
      clearTimeout(timeout); monitor?.kill();
      resolve({ mode, path: relative, status: failure || code !== 0 || !result ? 'failed' : 'ok',
        observedRssBytes, code, signal, failure, stderr: stderr || undefined, result });
    });
  });
}

async function main() {
  const scan = JSON.parse(fs.readFileSync(path.join(artifactsRoot, 'scan.json'), 'utf8'));
  const sqliteOnly = process.argv.includes('--sqlite-only');
  const measurements = sqliteOnly
    ? JSON.parse(fs.readFileSync(path.join(artifactsRoot, 'benchmarks.json'), 'utf8'))
    : { environment: environment(), protection: { timeoutMs: 120000, rssLimitBytes: 2 * 1024 ** 3, nodeHeapMiB: 1024 }, structures: [], benchmarks: [] };
  if (sqliteOnly) measurements.benchmarks = measurements.benchmarks.filter(run => run.mode !== 'sqlite');
  if (!sqliteOnly) {
  for (const relative of samples) {
    console.error('结构调查：' + relative);
    measurements.structures.push(await runIsolated('structure', relative));
    writeArtifact('benchmarks.json', measurements);
  }
  for (const mode of ['parse', 'stream']) {
    for (const relative of benchmarkSamples) {
      for (let run = 0; run < 3; run++) {
        console.error(`基准 ${mode} ${run + 1}/3：${relative}`);
        measurements.benchmarks.push({ run: run + 1, ...await runIsolated(mode, relative) });
        writeArtifact('benchmarks.json', measurements);
      }
    }
  }
  }
  for (const driver of ['node', 'better']) {
    for (let run = 0; run < 3; run++) {
      console.error(`SQLite ${driver} ${run + 1}/3`);
      measurements.benchmarks.push({ run: run + 1, ...await runIsolated('sqlite', driver) });
      writeArtifact('benchmarks.json', measurements);
    }
  }
  measurements.finalState = gitState();
  measurements.fingerprintChecks = [];
  for (const fingerprint of scan.fingerprints) {
    const filename = sourcePath(fingerprint.path);
    measurements.fingerprintChecks.push({ path: fingerprint.path,
      unchanged: (await hashFile(filename)) === fingerprint.sha256 && fs.statSync(filename).mtimeMs === fingerprint.mtimeMs });
  }
  measurements.datasetUnchanged = JSON.stringify(scan.initialState) === JSON.stringify(measurements.finalState)
    && measurements.fingerprintChecks.every(check => check.unchanged);
  writeArtifact('benchmarks.json', measurements);
  console.log(JSON.stringify({ datasetUnchanged: measurements.datasetUnchanged,
    failures: [...measurements.structures, ...measurements.benchmarks].filter(run => run.status !== 'ok').map(run => ({ mode: run.mode, path: run.path, failure: run.failure })) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('调查失败：' + error.stack); process.exitCode = 1; });
}
