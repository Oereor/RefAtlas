import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { workspaceRoot, artifactsRoot, sourcePath, hashFile, gitState, environment, writeArtifact } from './common.mjs';

const load = name => JSON.parse(fs.readFileSync(path.join(artifactsRoot, name), 'utf8'));
const scan = load('scan.json');
const benchmarks = load('benchmarks.json');
const sources = load('sources.json');
const electron = load('electron.json');
assert.deepEqual(gitState(), scan.initialState, '外部数据仓库状态必须与开始一致');
for (const sample of scan.fingerprints) assert.equal(await hashFile(sourcePath(sample.path)), sample.sha256, '样本 SHA-256 必须一致');
for (const run of [...benchmarks.structures, ...benchmarks.benchmarks]) assert.equal(run.status, 'ok', '实验不可失败后被当作成功');
for (const run of benchmarks.benchmarks.filter(run => run.mode === 'parse')) {
  const structure = benchmarks.structures.find(entry => entry.path === run.path);
  assert.equal(run.result.records, structure.result.records, '完整解析与流式记录计数必须一致');
}
for (const run of benchmarks.benchmarks.filter(run => run.mode === 'sqlite')) {
  assert.equal(run.result.rows, 50000);
  assert.equal(run.result.precision.textExact, true);
  assert.equal(run.result.precision.signed, '6186714091647966180');
  assert.equal(run.result.timings.exact.resultCount, 1);
  assert.equal(run.result.timings.pageKeyset.resultCount, 100);
}
assert.equal(electron.nodeSqlite.ok, true); assert.equal(electron.betterSqlite.ok, true);
assert.equal(sources.documents.filter(source => source.status === 'failed').length, 0);
assert.equal(sources.packages.filter(source => source.error).length, 0);

const markdownFiles = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'artifacts', '.cache'].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(filename);
    else if (entry.name.endsWith('.md')) markdownFiles.push(filename);
  }
}
visit(path.join(workspaceRoot, 'RefAtlas'));
let checkedLinks = 0;
for (const filename of markdownFiles) {
  const text = fs.readFileSync(filename, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    checkedLinks++;
    assert.ok(fs.existsSync(path.resolve(path.dirname(filename), target)), `文档链接不存在：${filename} → ${target}`);
  }
}
for (const forbidden of ['src', 'electron.vite.config.ts', 'forge.config.ts', '.github/workflows/release.yml']) {
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'RefAtlas', forbidden)), false, 'Phase 0 不应包含生产脚手架');
}
const result = { environment: environment(), datasetUnchanged: true, sampleHashes: scan.fingerprints.length,
  experiments: benchmarks.structures.length + benchmarks.benchmarks.length, markdownFiles: markdownFiles.length,
  checkedLinks, officialDocuments: sources.documents.length, packages: sources.packages.length,
  electronUtilityProbe: true, productionScaffold: false };
writeArtifact('validation.json', result);
console.log('验收通过：' + JSON.stringify(result, null, 2));
