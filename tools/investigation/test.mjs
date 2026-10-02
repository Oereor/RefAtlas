import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { observe, collectRecords } from './streaming.mjs';
import { artifactPath, artifactsRoot, inside, removeArtifact, sourcePath } from './common.mjs';
import { runIsolated } from './run.mjs';

test('数组、对象、嵌套和记录计数', async () => {
  const array = await observe(Readable.from(['[{"ids":[1,2]},null,"a",true,{}]']));
  assert.equal(array.shape, 'array'); assert.equal(array.records, 5); assert.equal(array.maxDepth, 3);
  const object = await observe(Readable.from(['{"a":{"v":1},"b":2,"c":[]}']));
  assert.equal(object.records, 3); assert.equal(object.shape, 'object');
});

test('不安全整数、无符号 64 位与数字词法', async () => {
  const input = '[6186714091647966180,16752756560315677817,-9007199254740992,1.25]';
  const result = await observe(Readable.from([input]));
  assert.equal(result.unsafeIntegerTokens, 3); assert.equal(result.unsigned64Tokens, 1);
  assert.equal(result.unsafeExamples[0], '6186714091647966180');
  const filename = artifactPath('precision-fixture.json');
  try {
    fs.writeFileSync(filename, input);
    const records = await collectRecords(filename, 'array', 4);
    assert.equal(records[1].value, '16752756560315677817');
    assert.equal(records[3].value, '1.25');
  } finally { if (fs.existsSync(filename)) removeArtifact(filename); }
});

test('非法 JSON 失败而不是产生成功证据', async () => {
  await assert.rejects(observe(Readable.from(['{"a":'])));
});

test('背压与超长单记录，缓冲区不会丢字符', async () => {
  const source = '[{"text":"' + '字'.repeat(100000) + '"},{"next":1}]';
  const chunks = [];
  for (let index = 0; index < source.length; index += 13) chunks.push(source.slice(index, index + 13));
  const result = await observe(Readable.from(chunks, { highWaterMark: 1 }));
  assert.equal(result.records, 2); assert.ok(result.maxRecordCharacters >= 100000);
});

test('输入输出边界和只清理自身产物', () => {
  assert.equal(inside(artifactsRoot, path.join(artifactsRoot, '..', 'other')), false);
  assert.throws(() => artifactPath('../escape.json'));
  assert.throws(() => sourcePath('../RefAtlas/README.md'));
  assert.throws(() => removeArtifact(path.join(artifactsRoot, '..', 'package.json')));
});

test('子进程超时和内存保护会报告失败', async () => {
  const filename = artifactPath('guard-fixture.cjs');
  try {
    fs.writeFileSync(filename, "setInterval(()=>process.send({kind:'memory',rssBytes:1000000}),10)");
    const timeout = await runIsolated('fixture', '', { script: filename, timeoutMs: 1000 });
    assert.equal(timeout.status, 'failed'); assert.match(timeout.failure, /时间/);
    const memory = await runIsolated('fixture', '', { script: filename, rssLimitBytes: 1, timeoutMs: 10000 });
    assert.equal(memory.status, 'failed'); assert.match(memory.failure, /RSS/);
  } finally { if (fs.existsSync(filename)) removeArtifact(filename); }
});
