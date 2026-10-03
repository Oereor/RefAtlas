import { resolve } from 'node:path'
import { runProcess } from './process.mjs'

const root = resolve(import.meta.dirname, '..')
await runProcess(
  process.execPath,
  [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/raw-real-data.test.ts'],
  { cwd: root, env: { ...process.env, REFATLAS_REAL_DATA: '1' }, timeoutMs: 120000 },
)
