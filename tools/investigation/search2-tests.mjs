// Small owned-fixture correctness checks after the stop; no further large candidate experiments.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import parser from 'stream-json/parser.js';
import { scan, db, root, output, save, typedKey, fingerprint, factMatches, resultIdentity, exactKey, removeOwned } from './search2-lib.mjs';
import { resolveOccurrences, candidates } from './search2-resolve.mjs';

const outcomes = [], cleanup = [];
async function test(name, f) { await f(); outcomes.push({ name, passed: true }); }
const filename = output('fixture-semantics.json');
const raw = '{"a/b~c":[1001,"1001",1,1.0,1.00,1e0,-0,9007199254740993,true,null,"true","null"],"container":{},"text":["\\ufeffx","a\\u0000b","\\ud800","🙂","é","e\\u0301","跨块转义"],"\\ud800":0}';
fs.writeFileSync(filename, raw);
const facts = []; const parsed = await scan(filename, { onFact: f => facts.push(f), chunkBytes: 7 });
const source = { id: 1, path: path.basename(filename), stamp: parsed.stamp, sha256: parsed.sha256, bytes: parsed.bytes, state: 'ready' };
const escaped = k => k.replaceAll('~', '~0').replaceAll('/', '~1');
async function independent(file) {
  const rows = [], stack = [];
  const locate = kind => { const parent = stack.at(-1), key = parent ? parent.array ? parent.count : parent.key : null, pointer = parent ? parent.pointer + '/' + escaped(String(key)) : ''; if (parent) { parent.count++; if (!parent.array) rows.push({ class: 'FIELD', kind: 'field', valueKind: kind, pointer, text: key }); } return pointer; };
  await pipeline(fs.createReadStream(file, { highWaterMark: 5 }), parser.asStream({ streamKeys: false, streamStrings: false, streamNumbers: false }), new Writable({ objectMode: true, write(t, _, done) { try {
    if (t.name === 'keyValue') stack.at(-1).key = t.value;
    else if (t.name === 'startObject' || t.name === 'startArray') stack.push({ pointer: locate(t.name === 'startObject' ? 'object' : 'array'), array: t.name === 'startArray', count: 0 });
    else if (t.name === 'endObject' || t.name === 'endArray') stack.pop();
    else if (['stringValue', 'numberValue', 'trueValue', 'falseValue', 'nullValue'].includes(t.name)) { const kind = t.name === 'stringValue' ? 'string' : t.name === 'numberValue' ? 'number' : t.name === 'nullValue' ? 'null' : 'boolean'; rows.push({ class: 'VALUE', kind, pointer: locate(kind), text: kind === 'null' ? 'null' : String(t.value) }); }
    done();
  } catch (e) { done(e); } } })); return rows;
}
try {
  const reference = await independent(filename);
  await test('independent parser: types, lexemes, FEFF, escaping, Unicode and container FIELD', async () => {
    assert.deepEqual(facts.map(f => [f.class, f.kind, f.valueKind || f.kind, f.pointer, f.text]), reference.map(f => [f.class, f.kind, f.valueKind || f.kind, f.pointer, f.text]));
    assert(facts.some(f => f.class === 'FIELD' && f.pointer === '/container' && f.valueKind === 'object'));
    assert(facts.some(f => f.kind === 'number' && f.text === '9007199254740993'));
  });
  await test('typed fingerprint domains and forced collision candidate union', async () => {
    const num = { class: 'VALUE', kind: 'number', text: '1001' }, str = { class: 'VALUE', kind: 'string', text: '1001' };
    for (const bytes of [8, 16]) assert.notDeepEqual(fingerprint(num, bytes), fingerprint(str, bytes));
    const buckets = new Map(); for (const [f, id] of [[num, 1], [str, 2]]) { const forced = '00'; buckets.set(forced, new Set([...(buckets.get(forced) || []), id])); }
    assert.deepEqual([...buckets.get('00')], [1, 2]);
    assert.equal(factMatches({ scope: 'NUMBER', match: 'exact', query: '1001' }, str), false);
  });
  const d = db('fixture-candidate.db');
  try {
    d.exec('CREATE TABLE files(id INTEGER PRIMARY KEY,path TEXT,stamp TEXT,sha256 TEXT,bytes INTEGER,state TEXT);CREATE TABLE terms(id INTEGER PRIMARY KEY,class TEXT,kind TEXT,exact_key TEXT,scan_text TEXT);CREATE TABLE memberships(term_id INTEGER,source_id INTEGER,PRIMARY KEY(term_id,source_id)) WITHOUT ROWID;');
    d.prepare('INSERT INTO files VALUES(?,?,?,?,?,?)').run(source.id, source.path, source.stamp, source.sha256, source.bytes, source.state);
    let id = 0; const unique = new Map(facts.map(f => [typedKey(f), f]));
    for (const f of unique.values()) { d.prepare('INSERT INTO terms VALUES(?,?,?,?,?)').run(++id, f.class, f.kind, exactKey(f.kind, f.text), f.text.isWellFormed() ? f.text : null); d.prepare('INSERT INTO memberships VALUES(?,?)').run(id, 1); }
    await test('candidate lookup and raw resolver match independent identity sets', async () => {
      for (const [scope, match, query] of [['VALUE', 'exact', '1001'], ['STRING', 'contains', '\ufeff'], ['STRING', 'contains', '\0'], ['STRING', 'exact', '\ud800'], ['STRING', 'contains', '\ud83d'], ['STRING', 'exact', 'é'], ['STRING', 'exact', 'e\u0301'], ['FIELD', 'exact', 'container']]) {
        const q = { scope, match, query }, candidate = await candidates(d, q), expected = reference.filter(f => factMatches(q, f));
        assert.equal(candidate.sources.length, expected.length ? 1 : 0);
        const result = await resolveOccurrences(q, candidate.sources, { sourceRoot: root, candidateMs: candidate.metrics.lookupMs });
        assert.equal(result.count, expected.length); assert.equal(result.verifiedCount, expected.length);
        const digest = createHash('sha256'); for (const f of expected) digest.update(resultIdentity(f, source.path, source.sha256) + '\n');
        assert.equal(result.orderedIdentityDigest, digest.digest('hex'));
        assert(result.firstVerifiedResultMs === null || result.firstVerifiedResultMs >= result.firstResultMs);
        for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(output('query-spool.db' + suffix))) cleanup.push(removeOwned('query-spool.db' + suffix));
      }
    });
    await test('cancelled work does not become complete', async () => {
      const c = new AbortController(); c.abort();
      await assert.rejects(resolveOccurrences({ scope: 'VALUE', match: 'exact', query: '1001' }, [source], { sourceRoot: root, signal: c.signal, spool: false }), e => e.message === 'CANCELLED' && !e.observation.complete && e.observation.verifiedCount === 0);
    });
    await test('source change invalidates candidate', async () => {
      fs.appendFileSync(filename, ' ');
      await assert.rejects(resolveOccurrences({ scope: 'VALUE', match: 'exact', query: '1001' }, [source], { sourceRoot: root, spool: false }), e => e.message === 'STALE_CANDIDATE_SOURCE' && !e.observation.complete);
    });
    await test('stale coverage excludes source without claiming workspace complete', async () => {
      d.prepare("UPDATE files SET state='stale' WHERE id=1").run(); const q = { scope: 'VALUE', match: 'exact', query: '1001' }, c = await candidates(d, q); assert.equal(c.sources.length, 0);
      const result = await resolveOccurrences(q, c.sources, { sourceRoot: root, spool: false }); assert(result.candidateResolutionComplete); assert.equal(result.workspaceSearchComplete, false);
    });
  } finally { d.close(); }
  await test('duplicate keys remain an explicit navigation failure', async () => {
    const p = output('fixture-duplicate.json'); fs.writeFileSync(p, '{"x":1,"x":2}');
    await assert.rejects(scan(p), /AMBIGUOUS_OBJECT_KEY/); cleanup.push(removeOwned('fixture-duplicate.json'));
  });
  save('fixture-checks.json', { scope: 'small synthetic fixtures only; no full-dataset proof or performance gate', independentParser: 'stream-json 3.7.0', checks: outcomes, cleanup, passed: true });
  console.log(JSON.stringify({ passed: true, checks: outcomes }));
} finally {
  for (const name of ['fixture-semantics.json', 'fixture-candidate.db', 'fixture-candidate.db-wal', 'fixture-candidate.db-shm']) if (fs.existsSync(output(name))) removeOwned(name);
}
