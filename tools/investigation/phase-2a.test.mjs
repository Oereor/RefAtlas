import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import parser from 'stream-json/parser.js';
import Database from 'better-sqlite3';
import { inspectBuffer, bytes, page, readSlice } from './phase-2a-helper.mjs';

test('保留全部 numeric lexeme 与六类 JSON 值；wire 统计对应实际表示', () => {
  const lexemes = ['123', '123.0', '1e3', '1.00', '-0', '16752756560315677817', '1' + '0'.repeat(2048)];
  const source = Buffer.from(`[${lexemes.join(',')},"123",true,false,null,{},[]]`);
  const observed = inspectBuffer(source, { chunkSize: 1, retainDepth: 100 });
  assert.deepEqual(observed.raw.items.slice(0, lexemes.length).map(x => x.lexeme), lexemes);
  assert.equal(observed.raw.items[lexemes.length].kind, 'string');
  assert.equal(observed.numeric.negativeZero, 1);
  assert.equal(observed.root.wireBytes, bytes(observed.raw));
});

test('UTF-8、转义、空白、Pointer 和容器边界在任意分块下精确回读', () => {
  const input = Buffer.from(' { "~/键": ["中文🙂", "\\uD83D\\uDE42\\n\\\"", -0, {"":true}], "__proto__": null } \r\n');
  for (const chunkSize of [1, 2, 3, 7, 65536]) {
    const nodes = [];
    const result = inspectBuffer(input, { chunkSize, retainDepth: 100, onNode: node => nodes.push(node) });
    assert.equal(result.root.wireBytes, bytes(result.raw));
    assert.equal(nodes.find(x => x.pointer === '/~0~1键/0').value.value, '中文🙂');
    for (const node of nodes) {
      const fragment = input.subarray(node.start, node.end);
      const parsed = inspectBuffer(fragment, { retainDepth: 100 });
      assert.deepEqual(parsed.raw, node.value);
    }
  }
});

test('BOM 字节基准与 escaped lone surrogate 均保留；SQLite canonical string 避免 UTF-8 损失', () => {
  const input = Buffer.from('\uFEFF{"键":["\\uD800","e\\u0301","\\u0000"]}');
  const nodes = [];
  const r = inspectBuffer(input, { chunkSize: 1, retainDepth: 100, onNode: node => nodes.push(node) });
  assert.equal(r.root.start, 3); assert.equal(r.root.end, input.length);
  for (const node of nodes) assert.deepEqual(inspectBuffer(input.subarray(node.start, node.end), { retainDepth: 100 }).raw, node.value);
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE v(canonical TEXT)');
    const lone = String.fromCharCode(0xd800);
    db.prepare('INSERT INTO v VALUES(?)').run(JSON.stringify(lone));
    assert.equal(JSON.parse(db.prepare('SELECT canonical FROM v').get().canonical), lone);
  } finally { db.close(); }
});

test('stream-json 数值 token 保真，chunk 模式长字符串不聚合为 packed value', async () => {
  const source = '[16752756560315677817,-0,1.00,1e3,"' + '中'.repeat(10000) + '"]';
  const numbers = []; let stringChars = 0; let packedStrings = 0;
  await pipeline(Readable.from([Buffer.from(source)]), parser.asStream({ packStrings: false, streamStrings: true, streamNumbers: false }), new Writable({
    objectMode: true, write(token, encoding, callback) {
      if (token.name === 'numberValue') numbers.push(token.value);
      if (token.name === 'stringChunk') stringChars += token.value.length;
      if (token.name === 'stringValue') packedStrings++;
      callback();
    }
  }));
  assert.deepEqual(numbers, ['16752756560315677817', '-0', '1.00', '1e3']);
  assert.equal(stringChars, 10000); assert.equal(packedStrings, 0);
});

test('错误 JSON 不进入结构统计，重复对象键不静默消失', () => {
  for (const text of ['{"x":01}', '[1,]', '{"x":}', '{', 'true false']) assert.throws(() => inspectBuffer(Buffer.from(text)));
  const duplicate = inspectBuffer(Buffer.from('{"x":1,"x":2}'), { retainDepth: 100 });
  assert.equal(duplicate.duplicates, 1); assert.equal(duplicate.raw.entries.length, 2);
});

test('ordinal 分页连续、不同 numeric-looking key 保持源顺序', () => {
  const entries = [];
  inspectBuffer(Buffer.from('{"10":1,"2":2,"01":3}'), { onNode: node => { if (node.depth === 1) entries.push(node); } });
  const first = page(entries, -1, 2); const second = page(entries, first.next, 2);
  assert.deepEqual([...first.items, ...second.items].map(x => x.pointer), ['/10', '/2', '/01']);
  assert.throws(() => page(entries, -1, 0));
});

test('源版本失效阻断 byte range 回读', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'refatlas-2a-'));
  const filename = path.join(directory, 'source.json');
  try {
    fs.writeFileSync(filename, '[1,2]');
    assert.equal(readSlice(filename, { start: 1, end: 2 }, 'a', 'a').toString(), '1');
    assert.throws(() => readSlice(filename, { start: 1, end: 2 }, 'a', 'b'), /SOURCE_CHANGED/);
  } finally { fs.rmSync(filename); fs.rmdirSync(directory); }
});

test('SQLite Exact 不转换类型或 numeric lexeme，不受 signed64 上限影响', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE v(kind TEXT, value TEXT COLLATE BINARY); CREATE INDEX exact ON v(kind,value);');
    const insert = db.prepare('INSERT INTO v VALUES (?,?)');
    for (const lexeme of ['123', '123.0', '1e3', '1.00', '-0', '0', '16752756560315677817']) insert.run('number', lexeme);
    insert.run('string', '123');
    const exact = db.prepare('SELECT value FROM v WHERE kind=? AND value=?');
    assert.equal(exact.all('number', '123').length, 1);
    assert.equal(exact.all('string', '123').length, 1);
    assert.equal(exact.all('number', '123.00').length, 0);
    assert.equal(exact.get('number', '16752756560315677817').value, '16752756560315677817');
    assert.equal(exact.get('number', '-0').value, '-0');
  } finally { db.close(); }
});
