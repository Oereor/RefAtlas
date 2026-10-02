import fs from 'node:fs';
import crypto from 'node:crypto';
import { artifactPath, writeArtifact } from './common.mjs';

const packages = ['electron', 'svelte', 'typescript', 'vite', '@electron-forge/cli', '@electron-forge/plugin-vite',
  'electron-vite', 'electron-builder', 'stream-json', '@streamparser/json', 'better-sqlite3',
  '@tanstack/svelte-virtual', '@tanstack/svelte-table', 'codemirror', 'monaco-editor', 'cytoscape', 'sigma',
  'zod', 'chokidar', 'vitest', '@playwright/test', 'eslint', 'prettier', '@types/better-sqlite3', '@sveltejs/vite-plugin-svelte'];
const documents = {
  electronStable: 'https://releases.electronjs.org/',
  utility: 'https://www.electronjs.org/docs/latest/api/utility-process',
  processes: 'https://www.electronjs.org/docs/latest/tutorial/process-model',
  security: 'https://www.electronjs.org/docs/latest/tutorial/security',
  sqlite: 'https://nodejs.org/docs/latest-v24.x/api/sqlite.html',
  forgeVite: 'https://www.electronforge.io/config/plugins/vite',
  forgeGithub: 'https://www.electronforge.io/config/publishers/github',
  forgeNative: 'https://www.electronforge.io/config/plugins/auto-unpack-natives',
  electronVite: 'https://electron-vite.org/guide/',
  electronViteWorker: 'https://electron-vite.org/guide/dev',
  builderMac: 'https://www.electron.build/docs/mac',
  builderWin: 'https://www.electron.build/docs/win',
  builderSign: 'https://www.electronforge.io/guides/code-signing/code-signing-macos',
  windowsSign: 'https://www.electronforge.io/guides/code-signing/code-signing-windows',
  builderPublish: 'https://www.electron.build/docs/publish',
  tanstackVirtual: 'https://tanstack.com/virtual/latest/docs/framework/svelte/svelte-virtual',
  tanstackTable: 'https://tanstack.com/table/latest/docs/framework/svelte/guide/table-state',
  codemirror: 'https://codemirror.net/docs/',
  monaco: 'https://raw.githubusercontent.com/microsoft/monaco-editor/main/README.md',
  cytoscape: 'https://js.cytoscape.org/',
  sigma: 'https://www.sigmajs.org/docs/',
  streamParser: 'https://raw.githubusercontent.com/juanjoDiaz/streamparser-json/main/packages/plainjs/README.md',
  streamParserTokenizer: 'https://raw.githubusercontent.com/juanjoDiaz/streamparser-json/main/packages/plainjs/src/tokenizer.ts',
  streamJson: 'https://raw.githubusercontent.com/uhop/stream-json/master/README.md',
  betterSqlite: 'https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/README.md',
  betterInteger: 'https://raw.githubusercontent.com/WiseLibs/better-sqlite3/master/docs/integer.md',
  runners: 'https://docs.github.com/en/actions/reference/runners/github-hosted-runners',
  appleNotary: 'https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution',
  sqliteFts: 'https://www.sqlite.org/fts5.html'
};
const retryOnly = process.argv.includes('--retry-only');
const result = retryOnly ? JSON.parse(fs.readFileSync(artifactPath('sources.json'), 'utf8'))
  : { fetchedAt: new Date().toISOString(), packages: [], documents: [] };
const retryNames = new Set(result.documents.filter(document => document.status === 'failed').map(document => document.name));
async function get(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'RefAtlas-Phase0-Investigation' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { response, text: await response.text() };
}
for (const name of retryOnly ? [] : packages) {
  const url = 'https://registry.npmjs.org/' + encodeURIComponent(name);
  try {
    const { text } = await get(url);
    const registry = JSON.parse(text);
    const version = registry['dist-tags'].latest;
    const selected = registry.versions[version];
    const compatible = Object.values(registry.versions).filter(candidate => !candidate.version.includes('-')
      && (name === 'vite' ? candidate.version.startsWith('7.') : name === '@sveltejs/vite-plugin-svelte' && candidate.peerDependencies?.vite?.includes('^7')))
      .sort((left, right) => new Date(registry.time[right.version]) - new Date(registry.time[left.version]))[0];
    result.packages.push({ name, version, published: registry.time?.[version], license: selected.license,
      engines: selected.engines, repository: selected.repository, peerDependencies: selected.peerDependencies,
      dependencyCount: Object.keys(selected.dependencies ?? {}).length, types: selected.types ?? selected.typings,
      exports: selected.exports, dist: selected.dist, url,
      compatibleVite7: compatible ? { version: compatible.version, peers: compatible.peerDependencies, published: registry.time[compatible.version] } : undefined });
    console.error(name + ' ' + version);
  } catch (error) { result.packages.push({ name, url, error: error.message }); }
  writeArtifact('sources.json', result);
}
for (const [name, url] of Object.entries(documents)) {
  if (retryOnly && !retryNames.has(name)) continue;
  result.documents = result.documents.filter(document => document.name !== name);
  try {
    const { response, text } = await get(url);
    fs.writeFileSync(artifactPath('sources/' + name + '.txt'), text);
    result.documents.push({ name, url, finalUrl: response.url, bytes: Buffer.byteLength(text),
      sha256: crypto.createHash('sha256').update(text).digest('hex'), title: text.match(/<title[^>]*>(.*?)<\/title>/s)?.[1], status: 'ok' });
    console.error('已读取来源：' + name);
  } catch (error) { result.documents.push({ name, url, error: error.message, status: 'failed' }); }
  writeArtifact('sources.json', result);
}
console.log(JSON.stringify({ packages: result.packages.length, documents: result.documents.length,
  failures: [...result.packages, ...result.documents].filter(entry => entry.error) }, null, 2));
