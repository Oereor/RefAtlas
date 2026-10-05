// Serial owned child supervisor. Disk lengths sampled at 100ms; no automatic retries.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, output, save, load, now, safety } from './search2-lib.mjs';
const script = process.argv[2], args = process.argv.slice(3);
if (!/^search2-[\w-]+\.mjs$/.test(script)) throw Error('INVALID_STAGE');
const name = script.replace(/\.mjs$/, '') + (args.includes('--pilot') ? '-pilot' : ''), began = now();
safety(); fs.mkdirSync(output('sqlite-temp'), { recursive: true });
const peaks = {}, log = fs.openSync(output(name + '.log'), 'a'); let maxRss = 0;
const sample = () => {
  for (const dir of [root, output('sqlite-temp')]) {
    for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); try { if (fs.statSync(p).isFile()) { const key = path.relative(root, p); peaks[key] = Math.max(peaks[key] || 0, fs.statSync(p).size); } } catch { /* closed transient files */ } }
  }
};
const child = spawn(process.execPath, ['--max-old-space-size=1024', path.join(import.meta.dirname, script), ...args], { cwd: import.meta.dirname, windowsHide: true, stdio: ['ignore', log, log, 'ipc'], env: { ...process.env, TMP: output('sqlite-temp'), TEMP: output('sqlite-temp'), SQLITE_TMPDIR: output('sqlite-temp') } });
const timer = setInterval(sample, 100), guardTimer = setTimeout(() => child.kill(), 45 * 60 * 1000);
let last;
child.on('message', m => { if (m.type === 'metrics') { maxRss = Math.max(maxRss, m.rss || 0); last = m; } });
process.on('SIGINT', () => child.kill('SIGINT'));
const heartbeat = setInterval(() => console.log(JSON.stringify({ stage: name, seconds: (now() - began) / 1000, last })), 30000);
try {
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); sample();
  const record = { stage: name, args, exit: code, wallMs: now() - began, sampledDiskHighWater: peaks, rssCheckpointsMax: maxRss, samplingMs: 100, deletedOrUnnamedSqliteTempNotObservable: true, childClosed: true };
  const previous = fs.existsSync(output('pipeline.json')) ? load('pipeline.json') : []; previous.push(record); save('pipeline.json', previous);
  console.log(JSON.stringify(record)); if (code !== 0) process.exitCode = 1;
} finally { clearInterval(timer); clearInterval(heartbeat); clearTimeout(guardTimer); fs.closeSync(log); }
