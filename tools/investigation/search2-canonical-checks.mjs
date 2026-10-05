// canonical JSON 子串仅作候选预筛，必须 decoded literal verify；包含空批次/ID gap。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { db, output, root, exactKey, typedKey, scan, literalContains, save, removeOwned } from './search2-lib.mjs';
import { referenceScan } from './search2-reference.mjs';
import { candidates } from './search2-resolve.mjs';
const file = output('canonical-fixture.json'), name = 'canonical-fixture.db';
fs.writeFileSync(file, '{"a/b~c":[1,1.0,1e0,-0,"a\\u0000b","line\\nbreak","quote\\\"x","slash\\\\x","\\ud800x","\\ud83d","🙂","é","e\\u0301","\\ufeffx","late-needle"],"container":{},"number":9007199254740993}');
const facts = [], parsed = await referenceScan(file, { chunkBytes: 5, onFact: f => facts.push(f) });
const d = db(name), unique = new Map(facts.map(f => [typedKey(f), f]));
// 独立 matching oracle：比较 code-point atoms，不复用被验证路径的 UTF-16 boundary helper。
const referenceContains = (text, query) => { const t=[...text],q=[...query];if(!q.length)return true;for(let i=0;i+q.length<=t.length;i++)if(q.every((c,j)=>t[i+j]===c))return true;return false; };
try {
  d.exec('CREATE TABLE files(id INTEGER PRIMARY KEY,path TEXT,stamp TEXT,sha256 TEXT,bytes INTEGER,state TEXT);CREATE TABLE terms(id INTEGER PRIMARY KEY,class TEXT,kind TEXT,exact_key TEXT,scan_text TEXT);CREATE TABLE memberships(term_id INTEGER,source_id INTEGER,PRIMARY KEY(term_id,source_id)) WITHOUT ROWID;');
  d.prepare("INSERT INTO files VALUES(1,?,?,?,?, 'ready')").run('canonical-fixture.json', parsed.stamp, parsed.sha256, parsed.bytes);
  let ordinal = 0; for (const f of unique.values()) { const id = f.text === 'late-needle' ? 5000 : ++ordinal; d.prepare('INSERT INTO terms VALUES(?,?,?,?,?)').run(id, f.class, f.kind, exactKey(f.kind, f.text), f.text.isWellFormed() ? f.text : null); d.prepare('INSERT INTO memberships VALUES(?,1)').run(id); }
  const checks = [];
  for (const [scope, query] of [['STRING','\0'],['STRING','\n'],['STRING','"'],['STRING','\\'],['STRING','\ud800'],['STRING','\ud83d'],['STRING','🙂'],['STRING','\ufeff'],['STRING','é'],['STRING','e\u0301'],['STRING','u0000'],['STRING','late-needle'],['FIELD','a/b~c'],['FIELD','container'],['NUMBER','1'],['NUMBER','1.0'],['NUMBER','1e0'],['NUMBER','-0'],['VALUE','x'],['ALL',''],['STRING','__absent__']]) {
    const q = { scope, query, match: 'contains' };
    const expected = [...unique.values()].filter(f => (scope === 'ALL' || scope === f.class || scope === f.kind.toUpperCase()) && referenceContains(f.text, query));
    const baseline = await candidates(d, q), optimized = await candidates(d, q, { dictionaryMode: 'canonical-range' });
    assert.deepEqual(optimized.sources.map(s => s.id), expected.length ? [1] : []); assert.deepEqual(optimized.sources.map(s => s.id), baseline.sources.map(s => s.id)); assert.equal(optimized.metrics.matchingTerms, expected.length);
    checks.push({ scope, query, expectedTerms: expected.length, passed: true });
  }
  assert.equal((await scan(file)).sha256, parsed.sha256);
  save('controlled-retry/canonical-prefilter-fixtures.json', { passed: true, checks, semantics: 'encoded prefilter is a superset; decoded code-point literal verification removes escaping false positives; malformed query falls back to bounded full ranges', independentParser: 'stream-json 3.7.0' });
  console.log(JSON.stringify({ passed: true, cases: checks.length }));
} finally { d.close(); for (const n of ['canonical-fixture.json', name, name + '-wal', name + '-shm']) if (fs.existsSync(output(n))) removeOwned(n); }
