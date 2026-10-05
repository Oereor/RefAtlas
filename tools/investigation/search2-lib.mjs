// Round 2 investigation only; never imported by the application.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { dataRoot, environment, gitState, samples, hashFile } from './common.mjs';
import { scan, exactKey, literalContains, stamp, inventory, now, guard } from './search-lib.mjs';
export { scan, exactKey, literalContains, stamp, inventory, now, guard, dataRoot, yieldTurn };
export const root = path.resolve(import.meta.dirname, 'artifacts/search-round2');
fs.mkdirSync(root, { recursive: true });
export const output = name => { const p = path.resolve(root, name); if (!p.startsWith(root + path.sep)) throw Error('OUTPUT_ESCAPE'); return p; };
export const save = (name, value) => fs.writeFileSync(output(name), JSON.stringify(value, null, 2) + '\n');
export const load = name => JSON.parse(fs.readFileSync(output(name), 'utf8'));
export function db(name, readonly = false) {
  const d = new Database(output(name), { readonly });
  d.pragma('cache_size=-32768'); d.pragma('temp_store=FILE');
  if (!readonly) { d.pragma('journal_mode=WAL'); d.pragma('synchronous=NORMAL'); d.pragma('wal_autocheckpoint=2048'); }
  return d;
}
export const typedKey = f => JSON.stringify([f.class, f.kind, exactKey(f.kind, f.text)]);
export const fingerprint = (f, bytes) => createHash('sha256').update(typedKey(f)).digest().subarray(0, bytes);
export function disk(name) { return Object.fromEntries(['', '-wal', '-shm'].map(s => [s || 'db', fs.existsSync(output(name + s)) ? fs.statSync(output(name + s)).size : 0])); }
export function progress(value) { console.log(JSON.stringify(value)); process.send?.({ type: 'metrics', rss: process.memoryUsage().rss, ...value }); }
export function quantiles(values) {
  const a = [...values].sort((x, y) => x - y), at = q => a[Math.max(0, Math.ceil(a.length * q) - 1)] ?? 0;
  return { count: a.length, p50: at(.5), p90: at(.9), p95: at(.95), p99: at(.99), p999: at(.999), max: at(1) };
}
export function histSummary(hist) {
  const a = [...hist].sort((x, y) => x[0] - y[0]), count = a.reduce((n, x) => n + x[1], 0);
  const at = q => { let n = 0; for (const [v, c] of a) { n += c; if (n >= Math.ceil(count * q)) return v; } return 0; };
  return { count, p50: at(.5), p90: at(.9), p95: at(.95), p99: at(.99), p999: at(.999), max: at(1), df1: hist.get(1) || 0, ...Object.fromEntries([5, 10, 100, 1000].map(k => ['dfLe' + k, a.filter(x => x[0] <= k).reduce((n, x) => n + x[1], 0)])), highFrequencyTail: a.filter(x => x[0] > 1000).reduce((n, x) => n + x[1], 0) };
}
export async function audit() {
  const fingerprints = [];
  for (const relative of [...samples, 'TextMap/TextMapJP.json']) { const p = path.join(dataRoot, relative); fingerprints.push({ path: relative, sha256: await hashFile(p), stamp: stamp(fs.statSync(p, { bigint: true })) }); }
  return { repository: gitState(), fingerprints, environment: environment() };
}
export function safety(projectedBytes = 12 * 1024 ** 3) {
  const s = fs.statfsSync(root, { bigint: true }), free = Number(s.bavail * s.bsize), reserve = 30 * 1024 ** 3;
  if (free < projectedBytes + reserve) throw Error('DISK_SAFETY_STOP');
  return { freeBytes: free, projectedBytes, reserveBytes: reserve };
}
export function removeOwned(name) {
  const p = output(name);
  if (path.dirname(p) !== root || fs.realpathSync(root) !== root || !fs.lstatSync(p).isFile() || fs.lstatSync(p).isSymbolicLink()) throw Error('UNSAFE_CLEANUP');
  const bytes = fs.statSync(p).size; fs.unlinkSync(p); return { name, bytes };
}
export const factMatches = (q, f) => (q.scope === 'ALL' || q.scope === f.class || q.scope === f.kind.toUpperCase()) && (q.match === 'exact' ? f.text === q.query : literalContains(f.text, q.query));
export const resultIdentity = (f, source, hash) => JSON.stringify([f.class, source, f.pointer, f.kind, exactKey(f.kind, f.text), hash]);
