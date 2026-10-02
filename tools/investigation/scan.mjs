import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { dataRoot, sourcePath, samples, environment, gitState, hashFile, writeArtifact } from './common.mjs';

function scan(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`不扫描链接：${filename}`);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) {
        const stat = fs.statSync(filename);
        files.push({ path: path.relative(dataRoot, filename).replaceAll('\\', '/'), bytes: stat.size });
      }
    }
  }
  visit(root);
  return files;
}

const initialState = gitState();
const runs = [];
let files;
for (let run = 0; run < 3; run++) {
  const started = performance.now();
  files = scan(dataRoot).filter(file => !file.path.startsWith('.git/'));
  runs.push({ elapsedMs: performance.now() - started, rssBytes: process.memoryUsage().rss });
}
const gitFiles = scan(path.join(dataRoot, '.git'));
const json = files.filter(file => file.path.endsWith('.json'));
const sum = entries => entries.reduce((total, file) => total + file.bytes, 0);
const areas = {};
for (const file of files) {
  const area = file.path.split('/')[0];
  areas[area] ??= { files: 0, bytes: 0, jsonFiles: 0 };
  areas[area].files++; areas[area].bytes += file.bytes;
  if (file.path.endsWith('.json')) areas[area].jsonFiles++;
}
const fingerprints = [];
for (const relative of samples) {
  const filename = sourcePath(relative);
  const stat = fs.statSync(filename);
  fingerprints.push({ path: relative, bytes: stat.size, mtimeMs: stat.mtimeMs, sha256: await hashFile(filename) });
}
const result = { environment: environment(), initialState, scanRuns: runs,
  measurement: '逻辑文件长度，扫描计时包含 .git 遍历，未清空操作系统缓存，不是冷读',
  dataFiles: files.length, dataBytes: sum(files), jsonFiles: json.length, jsonBytes: sum(json),
  gitFiles: gitFiles.length, gitBytes: sum(gitFiles), totalBytes: sum(files) + sum(gitFiles), areas,
  largestJson: json.sort((left, right) => right.bytes - left.bytes).slice(0, 30), fingerprints };
writeArtifact('scan.json', result);
console.log(JSON.stringify({ dataFiles: result.dataFiles, jsonFiles: result.jsonFiles, dataBytes: result.dataBytes,
  gitBytes: result.gitBytes, scanMs: runs.map(run => run.elapsedMs) }, null, 2));
