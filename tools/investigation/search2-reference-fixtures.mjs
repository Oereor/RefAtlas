// 新 reference 路径的有界 fixtures；旧 Attempt #1 fixture evidence 保持原字节。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { scan, output, save } from './search2-lib.mjs';
import { referenceScan } from './search2-reference.mjs';
const dir = output('controlled-retry/reference-fixtures'); fs.mkdirSync(dir, { recursive: true });
if (fs.realpathSync(dir) !== dir) throw Error('FIXTURE_ROOT_LINK');
const file = path.join(dir, 'semantics.json');
const raw = '{"a/b~c":[1001,"1001",1,1.0,1.00,1e0,-0,9007199254740993,true,null],"container":{},"text":["\\ufeffx","a\\u0000b","\\ud800","🙂","é","e\\u0301","跨块\\n转义"],"\\ud800":0}';
const results = [];
try {
  fs.writeFileSync(file, raw); const actual = [], expected = [];
  const a = await scan(file, { chunkBytes: 7, onFact: f => actual.push(f) });
  const b = await referenceScan(file, { onFact: f => expected.push(f), chunkBytes: 5 });
  const tuple = f => [f.class, f.kind, f.valueKind || f.kind, f.pointer, f.text];
  assert.deepEqual(actual.map(tuple), expected.map(tuple)); assert.equal(a.sha256, b.sha256);
  assert(expected.some(f => f.text === '\ufeffx')); assert(expected.some(f => f.text === '9007199254740993')); assert(expected.some(f => f.pointer === '/container' && f.valueKind === 'object'));
  results.push({ name: 'independent ordered type/literal/Pointer/FIELD value-kind parity, FEFF, numeric lexemes, Unicode, NUL, surrogate and escaping', passed: true });
  const controller = new AbortController(); let seen = 0;
  await assert.rejects(referenceScan(file, { signal: controller.signal, onFact: () => { if (++seen === 2) controller.abort(); } }), /CANCELLED/);
  results.push({ name: 'mid-parse cancellation rejects instead of returning complete', passed: true });
  let changed = false;
  await assert.rejects(referenceScan(file, { onFact: () => { if (!changed) { changed = true; fs.appendFileSync(file, ' '); } } }), /REFERENCE_SOURCE_CHANGED/);
  results.push({ name: 'source mutation during parse fails stamp verification', passed: true });
  fs.writeFileSync(file, '{"x":1,"x":2}'); const duplicate = await referenceScan(file); assert.equal(duplicate.duplicateKeys, 1);
  await assert.rejects(scan(file), /AMBIGUOUS_OBJECT_KEY/);
  results.push({ name: 'duplicate keys counted independently and navigation scanner refuses ambiguity', passed: true });
  fs.writeFileSync(file, '{"x":'); await assert.rejects(referenceScan(file));
  results.push({ name: 'parse failure does not return a successful source', passed: true });
  save('controlled-retry/reference-fixture-checks.json', { passed: true, checks: results, independentParser: 'stream-json 3.7.0', productionUnchanged: true });
  console.log(JSON.stringify({ passed: true, checks: results }));
} finally { if (fs.existsSync(file)) { if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw Error('UNSAFE_FIXTURE_CLEANUP'); fs.unlinkSync(file); } }
