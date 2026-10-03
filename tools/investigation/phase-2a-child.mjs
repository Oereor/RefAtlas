// Phase 2A 隔离实验；所有 DB 均临时，所有 source 均只读。
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { MessageChannel } from 'node:worker_threads';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import parser from 'stream-json/parser.js';
import pick from 'stream-json/filters/pick.js';
import Database from 'better-sqlite3';
import { sourcePath, artifactPath, removeArtifact } from './common.mjs';
import { inspectBuffer, distribution, bytes, readSlice } from './phase-2a-helper.mjs';

function decimalKey(lexeme) {
  if (lexeme.length > 64) return null;
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(lexeme);
  if (!m || (m[4]?.length ?? 0) > 4) return null;
  let exponent = Number(m[4] ?? '0') - (m[3]?.length ?? 0);
  let digits = (m[2] + (m[3] ?? '')).replace(/^0+/, '');
  if (!digits) return '0';
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent++; }
  return m[1] + digits + 'e' + exponent;
}
function structure(relative) {
  const started = performance.now();
  const filename = sourcePath(relative);
  const buffer = fs.readFileSync(filename);
  const readMs = performance.now() - started;
  const equivalences = new Map(); const variants = []; const selected = [];
  const result = inspectBuffer(buffer, { onNode(node) {
    if (node.scalar?.kind === 'number') {
      const lexeme = node.scalar.lexeme; const key = decimalKey(lexeme);
      if (key !== null) {
        const previous = equivalences.get(key);
        if (previous && previous.lexeme !== lexeme && variants.length < 6 && !variants.some(x => x.first === previous.lexeme && x.second === lexeme)) {
          variants.push({ first: previous.lexeme, firstPointer: previous.pointer, second: lexeme, secondPointer: node.pointer });
        }
        if (!previous && equivalences.size < 50000) equivalences.set(key, { lexeme, pointer: node.pointer });
      }
    }
    if (node.depth >= 2 && node.depth <= 3 && node.sourceBytes <= 65536 && selected.length < 3 && (node.kind === 'object' || node.kind === 'array')) {
      selected.push({ pointer: node.pointer, start: node.start, end: node.end, sourceBytes: node.sourceBytes, children: node.children });
    }
  } });
  delete result.raw;
  const analyzeMs = performance.now() - started - readMs;
  const roundtrips = [];
  for (const range of [...result.topExamples, ...selected]) {
    if (range.sourceBytes > 262144) continue;
    const fragment = readSlice(filename, range, 'fixed-experiment', 'fixed-experiment');
    const inspected = inspectBuffer(fragment);
    if (inspected.root.sourceBytes !== range.sourceBytes) throw new Error('range 回读长度不一致');
    roundtrips.push({ pointer: range.pointer, bytes: range.sourceBytes, kind: inspected.root.kind });
  }
  return { path: relative, bytes: buffer.length, readMs, analyzeMs, ...result,
    numericEquivalentVariants: variants, equivalentTrackingLimit: 50000, roundtrips,
    rssHighWaterMiB: process.resourceUsage().maxRSS / 1024 };
}

function collectCorpus() {
  const rows = [];
  const inputs = ['TextMap/TextMapCHS.json', 'ExcelOutput/AvatarConfig.json', 'ExcelOutput/AvatarSkillConfig.json', 'ExcelOutput/MonsterSkillConfig.json', 'Config/GlobalConfig/RealtimeConst.json'];
  const counts = [];
  for (const source of inputs) {
    const before = rows.length; let accepted = 0;
    inspectBuffer(fs.readFileSync(sourcePath(source)), { onNode(node) {
      if (!node.scalar || accepted >= (source.startsWith('TextMap') ? 50000 : 7000)) return;
      const scalar = node.scalar;
      const value = scalar.kind === 'number' ? scalar.lexeme : scalar.kind === 'null' ? 'null' : String(scalar.value);
      rows.push({ source, pointer: node.pointer, record: '/' + node.pointer.split('/')[1], field: String(node.key), type: scalar.kind, value });
      accepted++;
    } });
    counts.push({ source, rows: rows.length - before, selection: 'source-order prefix; complete scalar values' });
  }
  const synthetic = ['拍摄', '拍摄模式', 'Ａ，B—C', '🙂特殊字符', 'snake_case', 'CamelCase', '123', '123.0', '1e3', '1.00', '-0', '16752756560315677817', '100%_literal', 'abc', 'ABC', 'a"b', 'a\u0000b', 'é', 'e\u0301'];
  for (const [ordinal, value] of synthetic.entries()) rows.push({ source: 'synthetic', pointer: '/' + ordinal, record: '/' + ordinal, field: 'test', type: 'string', value });
  return { rows, counts, syntheticRows: synthetic.length };
}
const same = (left, right) => left.length === right.length && left.every((id, i) => id === right[i]);
function timed(query) {
  query(); const elapsed = []; let result;
  for (let run = 0; run < 3; run++) { const start = performance.now(); result = query(); elapsed.push(performance.now() - start); }
  return { result, ms: distribution(elapsed) };
}
function searchExperiment() {
  const corpus = collectCorpus(); const outputs = [];
  const queries = ['拍', '拍摄', '拍摄模式', 'Skill', 'Avatar_Mar_7th', 'snake_case', 'CamelCase', '123', '，', '🙂', '🙂特殊', '%_', 'ABC', 'a"b', '1001', 'a\u0000b', 'é', 'e\u0301'];
  for (const accelerator of ['none', 'unicode61', 'trigram']) {
    const filename = artifactPath(`phase-2a-${accelerator}.db`);
    const db = new Database(filename);
    try {
      db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL; CREATE TABLE scalars(id INTEGER PRIMARY KEY, source TEXT, pointer TEXT, record TEXT, field TEXT, type TEXT, value TEXT COLLATE BINARY); CREATE INDEX exact ON scalars(type,value,id); CREATE INDEX field_name ON scalars(field,id);');
      const insert = db.prepare('INSERT INTO scalars VALUES (?,?,?,?,?,?,?)');
      const insertStart = performance.now();
      db.transaction(() => { corpus.rows.forEach((row, i) => insert.run(i + 1, row.source, row.pointer, row.record, row.field, row.type, row.value)); })();
      const insertMs = performance.now() - insertStart;
      const ftsStart = performance.now();
      if (accelerator !== 'none') {
        const tokenizer = accelerator === 'trigram' ? 'trigram case_sensitive 1' : 'unicode61';
        db.exec(`CREATE VIRTUAL TABLE fts USING fts5(value, content='scalars', content_rowid='id', tokenize='${tokenizer}'); INSERT INTO fts(fts) VALUES('rebuild');`);
      }
      const ftsMs = performance.now() - ftsStart;
      const truth = db.prepare('SELECT id FROM scalars WHERE instr(value,?)>0 ORDER BY id');
      const like = db.prepare("SELECT id FROM scalars WHERE value LIKE ? ESCAPE '\\' ORDER BY id");
      const match = accelerator === 'none' ? null : db.prepare('SELECT rowid id FROM fts WHERE fts MATCH ? ORDER BY rowid');
      const queryResults = [];
      for (const query of queries) {
        const baseline = timed(() => truth.all(query).map(x => x.id));
        const jsTruth = corpus.rows.flatMap((row, i) => row.value.includes(query) ? [i + 1] : []);
        if (!same(jsTruth, baseline.result)) throw new Error('SQLite instr 与 JS literal 真值不一致');
        const escaped = '%' + query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') + '%';
        // LIKE 在 NUL 处终止；此类查询直接完整 literal 回退，不能遗漏候选。
        const likeTiming = timed(() => query.includes('\u0000') ? truth.all(query).map(x => x.id) : like.all(escaped).map(x => x.id));
        const likeVerified = likeTiming.result.filter(id => corpus.rows[id - 1].value.includes(query));
        if (!same(likeVerified, baseline.result)) throw new Error('LIKE 候选验证与真值不一致');
        const fallback = accelerator === 'none' || query.includes('\u0000') || (accelerator === 'trigram' && Array.from(query).length < 3);
        const candidates = timed(() => fallback ? truth.all(query).map(x => x.id) : match.all('"' + query.replaceAll('"', '""') + '"').map(x => x.id));
        const verifyStart = performance.now();
        const verified = candidates.result.filter(id => corpus.rows[id - 1].value.includes(query));
        const verifyMs = performance.now() - verifyStart;
        const correct = same(verified, baseline.result);
        if (accelerator === 'trigram' && !correct) throw new Error('trigram 候选漏匹配');
        queryResults.push({ query, baseline: { matches: baseline.result.length, ms: baseline.ms },
          like: { candidates: likeTiming.result.length, verified: likeVerified.length, ms: likeTiming.ms },
          accelerator: { fallback, candidates: candidates.result.length, verified: verified.length,
            matchesTruth: correct, missed: baseline.result.filter(id => !verified.includes(id)).length,
            ms: candidates.ms, verifyMs } });
      }
      const exact = db.prepare('SELECT id FROM scalars WHERE type=? AND value=? ORDER BY id');
      const exactChecks = ['1001', '123', '16752756560315677817', '-0'].map(value => ({ value,
        number: exact.all('number', value).length, string: exact.all('string', value).length }));
      const fieldChecks = ['Hash', 'SkillID', 'Skill', '不存在'].map(query => ({ query,
        exact: db.prepare('SELECT count(*) n FROM scalars WHERE field=?').get(query).n,
        contains: db.prepare('SELECT count(*) n FROM scalars WHERE instr(field,?)>0').get(query).n }));
      const fileChecks = ['Avatar', 'TextMap/', 'monster'].map(query => ({ query, files: corpus.counts.filter(x => x.source.includes(query)).map(x => x.source) }));
      const textChecks = ['拍', '拍摄', '拍摄模式'].map(query => ({ query, matches: db.prepare("SELECT count(*) n FROM scalars WHERE source='TextMap/TextMapCHS.json' AND type='string' AND instr(value,?)>0").get(query).n }));
      outputs.push({ accelerator, insertMs, ftsMs, databaseBytes: db.prepare('PRAGMA page_count').get().page_count * db.prepare('PRAGMA page_size').get().page_size,
        sqlite: db.prepare('SELECT sqlite_version() v').get().v, queryResults, exactChecks, fieldChecks, fileChecks, textChecks });
    } finally { db.close(); removeArtifact(filename); }
  }
  return { samples: corpus.counts, realRows: corpus.rows.length - corpus.syntheticRows, syntheticRows: corpus.syntheticRows,
    repeats: 3, includesAllMatches: true, workload: 'warm same-connection full result sets; no IPC; original-order samples', outputs };
}

async function accessExperiment() {
  const trials = [];
  const samples = [['Config/SoundBankLookUp.json', '/Events/10000'], ['Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json', '/DimensionList/0'], ['ExcelOutput/AvatarConfig.json', '/0']];
  for (const [source, pointer] of samples) {
    const filename = sourcePath(source); let range;
    inspectBuffer(fs.readFileSync(filename), { onNode(node) { if (node.pointer === pointer) range = { start: node.start, end: node.end, sourceBytes: node.sourceBytes, wireBytes: node.wireBytes, children: node.children }; } });
    if (!range) throw new Error('pointer 未发现');
    const sliceTiming = timed(() => readSlice(filename, range, 'fixed-experiment', 'fixed-experiment'));
    const parsed = inspectBuffer(sliceTiming.result);
    const extractParse = timed(() => inspectBuffer(readSlice(filename, range, 'fixed-experiment', 'fixed-experiment')));
    const scanMs = [];
    for (let run = 0; run < 3; run++) {
      const start = performance.now(); let tokens = 0;
      // once 只停止输出，pipeline 仍完整扫描源；明确计为全文件 pointer token scan。
      await pipeline(fs.createReadStream(filename), parser.asStream({ streamValues: false }), pick.asStream({ filter: pointer.slice(1).replaceAll('/', '.'), once: true }), new Writable({ objectMode: true, write(token, encoding, callback) { tokens++; callback(); } }));
      if (!tokens) throw new Error('stream-json pointer 无输出');
      scanMs.push(performance.now() - start);
    }
    const children = [];
    const childTiming = timed(() => {
      children.length = 0;
      inspectBuffer(sliceTiming.result, { onNode(node) {
        if (node.depth === 1 && children.length < 100) children.push({ ordinal: node.ordinal, pointer: pointer + node.pointer,
          kind: node.kind, sourceBytes: node.sourceBytes, children: node.children,
          preview: node.scalar ? (node.scalar.lexeme ?? String(node.scalar.value ?? '')).slice(0, 128) : null });
      } });
      return children;
    });
    trials.push({ source, pointer, range, byteReadMs: sliceTiming.ms, byteReadAndParseMs: extractParse.ms, fullFilePointerScanMs: distribution(scanMs),
      parsedKind: parsed.root.kind, childPage: { count: children.length, totalChildren: range.children, responseBytes: bytes(children),
        wholeRangeScanMs: childTiming.ms, limitation: 'full selected range scan; first 100 descriptors only; no persistent child index' } });
  }
  const transfer = [];
  for (const kib of [4, 16, 64, 256, 1024]) {
    const value = { kind: 'string', value: '中'.repeat(Math.floor(kib * 1024 / 3)) };
    const serialized = timed(() => JSON.stringify(value));
    const clone = timed(() => structuredClone(value));
    const { port1, port2 } = new MessageChannel();
    port2.on('message', msg => port2.postMessage(msg));
    const rtt = [];
    try {
      for (let i = 0; i < 11; i++) {
        const start = performance.now();
        await new Promise(resolve => { port1.once('message', resolve); port1.postMessage(value); });
        if (i) rtt.push(performance.now() - start);
      }
    } finally { port1.close(); port2.close(); }
    transfer.push({ utf8JsonBytes: bytes(value), utf16CodeUnits: value.value.length, serializeMs: serialized.ms, cloneMs: clone.ms, nodeMessagePortRoundTripMs: distribution(rtt) });
  }
  return { trials, transfer, transferLimitation: 'Node same-process MessageChannel; not Electron process/Preload/UI; synthetic payload; 1 warmup + 10 RTT; serialization 1 warmup + 3' };
}

const [mode, relative] = process.argv.slice(2);
try {
  const result = mode === 'structure' ? structure(relative) : mode === 'search' ? searchExperiment() : await accessExperiment();
  result.rssHighWaterMiB ??= process.resourceUsage().maxRSS / 1024;
  process.send?.({ kind: 'result', result });
} catch (error) { process.send?.({ kind: 'failure', message: error.stack }); process.exitCode = 1; }
