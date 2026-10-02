import Database from 'better-sqlite3'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { SqliteResult } from '../shared/protocol'

const nativeRequire = createRequire(import.meta.url)
export async function runSqliteSmoke(): Promise<SqliteResult> {
  const parent = resolve(tmpdir())
  const directory = await mkdtemp(join(parent, 'refatlas-smoke-'))
  if (dirname(resolve(directory)) !== parent) throw new Error('SQLite 临时目录超出边界')
  let database: Database.Database | undefined
  let result: Omit<SqliteResult, 'cleaned'>
  try {
    database = new Database(join(directory, 'smoke.sqlite'))
    database.exec('CREATE TABLE smoke (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    const insert = database.prepare('INSERT INTO smoke (key, value) VALUES (?, ?)')
    insert.run('unicode', '基础设施🙂')
    insert.run('integer', '16752756560315677817')
    const values = database.prepare('SELECT key, value FROM smoke ORDER BY key').all() as { key: string; value: string }[]
    const version = database.prepare('SELECT sqlite_version() AS version').get() as { version: string }
    const nativeFiles = Object.keys(nativeRequire.cache).filter(filename => filename.endsWith('.node') && filename.includes('better-sqlite3'))
    const nativeUnpacked = nativeFiles.some(filename => {
      const physical = filename.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked')
      return physical.includes('app.asar.unpacked') && existsSync(physical)
    })
    result = { rows: values.length, sqliteVersion: version.version, unicode: values.find(row => row.key === 'unicode')!.value,
      integerText: values.find(row => row.key === 'integer')!.value, nativeUnpacked }
  } finally {
    try { database?.close() } finally { await rm(directory, { recursive: true, force: true }) }
  }
  const cleaned = await access(directory).then(() => false, () => true)
  return { ...result, cleaned }
}
