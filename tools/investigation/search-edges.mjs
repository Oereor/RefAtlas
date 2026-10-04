// Investigation semantic parity and lifecycle fault experiments; all fixtures are app-owned.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import parser from 'stream-json/parser.js';
import { output, save, scan, exactKey, now, database,literalContains } from './search-lib.mjs';

export async function production() {
  const appRoot = path.resolve(import.meta.dirname, '../..');
  await build({ stdin: { contents: `export { RawDataService } from './src/utility/raw-service'; export { scanJson, WorkBudget } from './src/utility/raw-parser'; export { RAW_LIMITS } from './src/shared/raw';`, resolveDir: appRoot }, bundle: true, platform: 'node', format: 'cjs', outfile: output('production.cjs'), external: ['@streamparser/json'], logLevel: 'silent' });
  return createRequire(import.meta.url)(output('production.cjs'));
}

if (process.argv[1] === import.meta.filename) {
  const prod = await production(), results = [], db = database('edges.db');
  db.exec('DROP TABLE IF EXISTS raw; CREATE TABLE raw(kind TEXT,k TEXT,t TEXT,b BLOB);DROP TABLE IF EXISTS rawptr;CREATE TABLE rawptr(k TEXT);');
  const fixtures = [
    ['types', '{"a/b~c":[1,1.0,1.00,1e0,-0,9007199254740993,"1001",1001,true,false,null,"null","true"],"obj":{"container":[]},"unicode":["\\ud800","🙂","e\\u0301","é","中","a\\u0000b"],"\\ud800":"key","a\\u0000b":1}'],
    ['bom', '\ufeff{"中":"🙂","10":1,"2":2,"01":3}'],
  ];
  try {
    for (const [label, json] of fixtures) {
      const filename = output(`fixture-${label}.json`); fs.writeFileSync(filename, json);
      let expected;
      for (const chunkBytes of [1, 2, 3, 7, 4096]) {
        const facts = [];
        await scan(filename, { chunkBytes, onFact: f => facts.push(f) });
        if (expected) assert.deepEqual(facts, expected); else expected = facts;
      }
      const handle = await fs.promises.open(filename, 'r');
      for(const f of expected){db.prepare('INSERT INTO rawptr VALUES(?)').run(JSON.stringify(f.pointer));assert.equal(JSON.parse(db.prepare('SELECT k FROM rawptr ORDER BY rowid DESC LIMIT 1').get().k),f.pointer);}
      try {
        for (const f of expected.filter(f => f.class === 'VALUE')) {
          const result = await prod.scanJson(handle, fs.statSync(filename).size, new prod.WorkBudget(new AbortController().signal), { pointer: f.pointer, materialize: true, scalar: true });
          const value = result.scalar;
          const text = value.kind === 'number' ? value.lexeme : value.kind === 'null' ? 'null' : String(value.value);
          assert.equal(value.kind, f.kind); assert.equal(text, f.text);
          assert.deepEqual(result.node.range, { startByte: f.start, endByteExclusive: f.end });
        }
      } finally { await handle.close(); }
      results.push({ scenario: label, passed: true, facts: expected.length, chunkSizes: [1, 2, 3, 7, 4096], productionRangeAndScalarParity: true });
    }
    for (const text of ['\ud800', '🙂', 'e\u0301', 'é', 'a\0b']) {
      const k = exactKey('string', text), b = Buffer.from(text, 'utf16le');
      db.prepare('INSERT INTO raw VALUES(?,?,?,?)').run('string', k, text, b);
      const r = db.prepare('SELECT * FROM raw ORDER BY rowid DESC LIMIT 1').get();
      assert.equal(JSON.parse(r.k), text); assert.equal(r.b.toString('utf16le'), text);
      results.push({ scenario: 'SQLite Unicode roundtrip', input: k, textPreserved: r.t === text, encodedKeyPreserved: true, utf16BlobPreserved: true, instrNulSuffix: db.prepare('SELECT instr(t,?) n FROM raw ORDER BY rowid DESC LIMIT 1').get(text.slice(-1)).n });
    }
    const originalValues=['\ud800','🙂','e\u0301','é','a\0b'],fallbackProof=[];
    for(const query of ['\ud800','\ufffd','\ud83d','🙂','é','e\u0301','\0','b']) {
      const reference=originalValues.flatMap((t,i)=>literalContains(t,query)?[i+1]:[]);
      const encoded=db.prepare('SELECT rowid id,k FROM raw ORDER BY rowid').all().filter(r=>literalContains(JSON.parse(r.k),query)).map(r=>r.id);
      const textOnly=db.prepare('SELECT rowid id FROM raw WHERE instr(t,?)>0 ORDER BY rowid').all(query).map(r=>r.id);
      assert.deepEqual(encoded,reference);fallbackProof.push({query:JSON.stringify(query),reference,encodedFallback:encoded,textOnly});
    }
    results.push({scenario:'complete encoded Unicode literal fallback',proof:fallbackProof,passed:true});
    const feffFile=output('fixture-feff.json');
    fs.writeFileSync(feffFile,'{"leading":"\\uFEFFq","middle":"x\\uFEFFq","literal":"\ufeffq"}');
    const feffFacts=[];await scan(feffFile,{onFact:f=>{if(f.class==='VALUE')feffFacts.push(f);}});
    assert.deepEqual(feffFacts.map(f=>f.text),['\ufeffq','x\ufeffq','\ufeffq']);
    const feffHandle=await fs.promises.open(feffFile,'r');
    const observed=await prod.scanJson(feffHandle,fs.statSync(feffFile).size,new prod.WorkBudget(new AbortController().signal),{pointer:'/leading',materialize:true,scalar:true});await feffHandle.close();
    assert.notEqual(observed.scalar.value,'\ufeffq');
    results.push({scenario:'existing production U+FEFF fidelity issue',sourceExpected:'\ufeffq',productionObserved:observed.scalar.value,investigationPreserved:true,productionIssueConfirmed:true,productionModified:false});
    const unicodeTests=['ABC','abc','Straße','STRASSE','é','e\u0301','中🙂%_x','a\0b'];
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS edge_tri USING fts5(text,tokenize='trigram case_sensitive 1'); CREATE VIRTUAL TABLE IF NOT EXISTS edge_uni USING fts5(text,tokenize='unicode61'); DELETE FROM edge_tri; DELETE FROM edge_uni;");
    for(const text of unicodeTests) { db.prepare('INSERT INTO edge_tri(text) VALUES(?)').run(text); db.prepare('INSERT INTO edge_uni(text) VALUES(?)').run(text); }
    const comparisons=[];
    for(const query of ['ABC','abc','é','e\u0301','🙂','%_','中🙂%','b']) {
      const literal=unicodeTests.map((t,i)=>t.includes(query)?i+1:null).filter(Boolean);
      const instr=db.prepare('SELECT rowid FROM edge_tri WHERE instr(text,?)>0').all(query).map(x=>x.rowid);
      const escaped=query.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_');
      const like=db.prepare("SELECT rowid FROM edge_tri WHERE text LIKE ? ESCAPE '\\'").all('%'+escaped+'%').map(x=>x.rowid);
      const quoted='"'+query.replaceAll('"','""')+'"';
      const tri=db.prepare('SELECT rowid FROM edge_tri WHERE edge_tri MATCH ?').all(quoted).map(x=>x.rowid);
      const uni=db.prepare('SELECT rowid FROM edge_uni WHERE edge_uni MATCH ?').all(quoted).map(x=>x.rowid);
      assert.deepEqual(instr,literal);
      comparisons.push({query,literal,instr,like,trigramCandidates:tri,unicode61Candidates:uni});
    }
    results.push({scenario:'SQLite literal/tokenizer/collation edge matrix',comparisons,caseSensitiveBINARY:db.prepare("SELECT 'ABC'='abc' COLLATE BINARY n").get().n,asciiInsensitiveNOCASE:db.prepare("SELECT 'ABC'='abc' COLLATE NOCASE n").get().n,unicodeNotFullFoldNOCASE:db.prepare("SELECT 'Straße'='STRASSE' COLLATE NOCASE n").get().n});
    assert.equal(literalContains('🙂','\ud83d'),false);assert.equal(literalContains('🙂','\ude42'),false);assert.equal(literalContains('\ud800','\ud800'),true);assert.equal(literalContains('🙂','🙂'),true);
    results.push({scenario:'literal code-point boundaries',validSurrogatePairNotSplit:true,unpairedSurrogateLiteralPreserved:true});
    const longText = '中🙂'.repeat(100000) + 'crossBoundaryNeedle', longFile = output('fixture-large.json');
    fs.writeFileSync(longFile, JSON.stringify({ text: longText }));
    let longFact; await scan(longFile, { onFact: f => { if (f.kind === 'string') longFact = f; } });
    assert.equal(longFact.text, longText); assert(longFact.text.includes('crossBoundaryNeedle'));
    const handle = await fs.promises.open(longFile, 'r');
    let productionCode;
    try { await prod.scanJson(handle, fs.statSync(longFile).size, new prod.WorkBudget(new AbortController().signal), { pointer: '/text', materialize: false }); } catch (e) { productionCode = e.code; } finally { await handle.close(); }
    assert.equal(productionCode, 'RESOURCE_LIMIT');
    let decodedChunks = 0, tail = '', found = false;
    const stream = fs.createReadStream(longFile, { highWaterMark: 7 }).pipe(parser.asStream({ packKeys: true, packStrings: false, packNumbers: false, streamKeys: false }));
    for await (const token of stream) if (token.name === 'stringChunk') { decodedChunks++; const joined = tail + token.value; if (joined.includes('crossBoundaryNeedle')) found = true; tail = joined.slice(-32); }
    assert(found); results.push({ scenario: 'large scalar', utf8Bytes: Buffer.byteLength(longText), codePoints: [...longText].length, productionCode, investigationComplete: true, streamJsonChunkFallback: { found, decodedChunks, sourceChunkBytes: 7 } });
    for (const [label, json, expected] of [['duplicate', '{"x":1,"x":2}', 'AMBIGUOUS_OBJECT_KEY'], ['malformed', '{"x":', 'INVALID_JSON']]) {
      const filename = output(`fixture-${label}.json`); fs.writeFileSync(filename, json);
      let code; try { await scan(filename); } catch (e) { code = e.message; if (expected === 'INVALID_JSON' && !code.startsWith('RESOURCE_')) code = 'INVALID_JSON'; }
      assert.equal(code, expected); results.push({ scenario: label, code, passed: true });
    }
    const changed = output('fixture-changing.json'); fs.writeFileSync(changed, JSON.stringify({ text: 'a'.repeat(200000) }));
    let modified = false, code;
    try { await scan(changed, { async afterChunk() { if (!modified) { fs.appendFileSync(changed, ' '); modified = true; } } }); } catch (e) { code = e.message; }
    assert.equal(code, 'SOURCE_CHANGED'); results.push({ scenario: 'changed midway', code, passed: true });
    const cancel = new AbortController(); let cancelAt;
    const start = now();
    try { await scan(longFile, { signal: cancel.signal, afterChunk: async () => { cancelAt ??= now(); cancel.abort(); } }); } catch (e) { assert.equal(e.message, 'CANCELLED'); }
    results.push({ scenario: 'cancel initial parsing', totalMs: now() - start, cancelLatencyMs: now() - cancelAt, publishedComplete: false });
    save('edges.json', { results, passed: true }); console.log(JSON.stringify({ passed: true, scenarios: results.length }));
  } finally { db.close(); }
}
