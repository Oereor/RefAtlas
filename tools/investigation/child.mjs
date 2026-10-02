import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { sourcePath, artifactPath, removeArtifact } from './common.mjs';
import { observe, countLines, collectRecords } from './streaming.mjs';

const [mode, relative] = process.argv.slice(2);
const started = performance.now();
const memory = [];
const checkpoint = label => memory.push({ label, ...process.memoryUsage() });
checkpoint('启动');
const snapshot = setInterval(() => {
  if (process.send) process.send({ kind: 'memory', rssBytes: process.memoryUsage().rss });
}, 100);
let result;
try {
  if (mode === 'parse') {
    const filename = sourcePath(relative);
    const readStarted = performance.now();
    const text = fs.readFileSync(filename, 'utf8');
    const readMs = performance.now() - readStarted;
    checkpoint('读取后');
    const parseStarted = performance.now();
    const value = JSON.parse(text);
    const parseMs = performance.now() - parseStarted;
    checkpoint('解析后');
    result = { readMs, parseMs, totalMs: readMs + parseMs, characters: text.length,
      shape: Array.isArray(value) ? 'array' : typeof value,
      records: Array.isArray(value) ? value.length : Object.keys(value).length,
      correctness: 'JSON.parse 会舍入大整数，仅作为性能基线' };
  } else if (mode === 'stream' || mode === 'structure') {
    const filename = sourcePath(relative);
    const streamStarted = performance.now();
    result = await observe(fs.createReadStream(filename));
    result.streamMs = performance.now() - streamStarted;
    if (mode === 'structure') {
      result.lines = await countLines(filename);
      if (fs.statSync(filename).size < 5000000) {
        const sample = await collectRecords(filename, result.shape, 1);
        result.firstRecord = JSON.stringify(sample[0]).slice(0, 1600);
      }
    }
    checkpoint('流式处理后');
  } else if (mode === 'sqlite') {
    result = await sqliteBenchmark(relative);
    checkpoint('数据库关闭后');
  } else throw new Error('未知实验模式');
  result.elapsedMs = performance.now() - started;
  result.memory = memory;
  result.resourceUsage = process.resourceUsage();
  process.send?.({ kind: 'result', result });
  console.log(JSON.stringify(result));
} catch (error) {
  process.send?.({ kind: 'failure', message: error.stack });
  console.error('实验失败：' + error.stack);
  process.exitCode = 1;
} finally {
  clearInterval(snapshot);
  process.disconnect?.();
}

async function sqliteBenchmark(driver) {
  const fixture = await collectRecords(sourcePath('TextMap/TextMapCHS.json'), 'object', 50000);
  const databaseFile = artifactPath('sqlite-' + driver + '-' + process.pid + '.db');
  const Database = driver === 'node' ? (await import('node:sqlite')).DatabaseSync : (await import('better-sqlite3')).default;
  const database = new Database(databaseFile);
  try {
    database.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL;
      CREATE TABLE records(id TEXT PRIMARY KEY, field TEXT NOT NULL, text TEXT NOT NULL);
      CREATE INDEX field_index ON records(field, id);
      CREATE INDEX text_index ON records(text, id);
      CREATE TABLE edges(source TEXT NOT NULL, target TEXT NOT NULL, PRIMARY KEY(source,target));
      CREATE VIRTUAL TABLE search USING fts5(id UNINDEXED, text, tokenize='unicode61');`);
    const insert = database.prepare('INSERT INTO records VALUES(?,?,?)');
    const edge = database.prepare('INSERT INTO edges VALUES(?,?)');
    const fts = database.prepare('INSERT INTO search VALUES(?,?)');
    const insertStarted = performance.now();
    database.exec('BEGIN');
    for (let index = 0; index < fixture.length; index++) {
      const record = fixture[index];
      const text = record.value;
      insert.run(String(record.key), 'text', text);
      fts.run(String(record.key), text);
      edge.run(String(record.key), String(fixture[(index + 1) % fixture.length].key));
    }
    database.exec('COMMIT');
    const insertMs = performance.now() - insertStarted;
    checkpoint('索引插入后');
    const queries = [
      ['exact', 'SELECT text FROM records WHERE id=?', [String(fixture[1234].key)], 2000],
      ['field', 'SELECT id FROM records WHERE field=? AND id=?', ['text', String(fixture[1234].key)], 2000],
      ['value', 'SELECT id FROM records WHERE text=? LIMIT 100', [fixture[1234].value], 2000],
      ['pageOffset', 'SELECT id,text FROM records ORDER BY id LIMIT 100 OFFSET 20000', [], 200],
      ['pageKeyset', 'SELECT id,text FROM records WHERE id>? ORDER BY id LIMIT 100', [String(fixture[1234].key)], 200],
      ['fts', "SELECT id FROM search WHERE search MATCH ? LIMIT 100", ['拍摄'], 200],
      ['edge', 'SELECT target FROM edges WHERE source=? LIMIT 100', [String(fixture[1234].key)], 2000]
    ];
    const timings = {};
    for (const [name, sql, argumentsList, count] of queries) {
      const statement = database.prepare(sql);
      const first = statement.all(...argumentsList);
      for (let warmup = 0; warmup < 10; warmup++) statement.all(...argumentsList);
      const queryStarted = performance.now();
      for (let iteration = 0; iteration < count; iteration++) statement.all(...argumentsList);
      timings[name] = { iterations: count, totalMs: performance.now() - queryStarted, resultCount: first.length };
    }
    const version = database.prepare('SELECT sqlite_version() AS version').get().version;
    const compileOptions = database.prepare('PRAGMA compile_options').all().map(row => row.compile_options);
    const integer = database.prepare('SELECT CAST(? AS INTEGER) AS value');
    if (driver === 'node') integer.setReadBigInts(true); else integer.safeIntegers(true);
    const signed = integer.get('6186714091647966180').value;
    const overflow = integer.get('16752756560315677817').value;
    const expected = fixture[1234].value;
    if (database.prepare('SELECT text FROM records WHERE id=?').get(String(fixture[1234].key)).text !== expected) {
      throw new Error('数据库精确查询结果与原始文本不一致');
    }
    const chinese = database.prepare('SELECT count(*) AS total FROM records WHERE text LIKE ?').get('%拍摄%').total;
    const ftsChinese = database.prepare('SELECT count(*) AS total FROM search WHERE search MATCH ?').get('拍摄').total;
    database.exec('CREATE TABLE precision(value TEXT)');
    const textValue = '16752756560315677817';
    database.prepare('INSERT INTO precision VALUES(?)').run(textValue);
    const textRoundtrip = database.prepare('SELECT value FROM precision').get().value;
    database.close();
    return { driver, rows: fixture.length, source: 'TextMap/TextMapCHS.json 前 50000 条',
      syntheticEdges: true, insertMs, timings, sqliteVersion: version, compileOptions,
      databaseBytes: fs.statSync(databaseFile).size,
      precision: { signed: String(signed), unsignedCast: String(overflow), textRoundtrip, textExact: textRoundtrip === textValue },
      chineseSearch: { substringMatches: Number(chinese), unicode61Matches: Number(ftsChinese) },
      pragmas: 'DELETE, synchronous=NORMAL', correctness: '精确文本一致，关系边为合成数据' };
  } finally {
    if (driver === 'node' ? database.isOpen : database.open) database.close();
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      if (fs.existsSync(databaseFile + suffix)) removeArtifact(databaseFile + suffix);
    }
  }
}
