const result = { processType: process.type, versions: process.versions, nodeSqlite: {}, betterSqlite: {} };
for (const [name, create] of [
  ['nodeSqlite', () => new (require('node:sqlite').DatabaseSync)(':memory:')],
  ['betterSqlite', () => new (require('better-sqlite3'))(':memory:')]
]) {
  try {
    const database = create();
    database.exec('CREATE VIRTUAL TABLE texts USING fts5(text); INSERT INTO texts VALUES(\'hello\');');
    const integer = database.prepare('SELECT CAST(? AS INTEGER) AS value');
    if (name === 'nodeSqlite') integer.setReadBigInts(true); else integer.safeIntegers(true);
    result[name] = { ok: true, sqlite: database.prepare('SELECT sqlite_version() AS version').get().version,
      fts5: database.prepare('SELECT text FROM texts WHERE texts MATCH ?').get('hello').text === 'hello',
      bigInt: String(integer.get('6186714091647966180').value) };
    database.close();
  } catch (error) { result[name] = { ok: false, error: error.stack }; }
}
process.parentPort.postMessage(result);
