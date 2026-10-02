import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { runProcess } from './process.mjs'

const root = resolve(import.meta.dirname, '..')
const mode = process.argv[2] ?? 'built'
if (!['built', 'dev', 'packaged'].includes(mode)) throw new Error('无效 smoke 模式')
const parent = resolve(tmpdir())
const directory = await mkdtemp(join(parent, 'refatlas-smoke-run-'))
try {
  await runProcess(process.execPath, [resolve(root, 'scripts/smoke-worker.mjs'), mode, directory], { cwd: root, timeoutMs: 120000 })
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  if (dirname(resolve(directory)) !== parent || !directory.split(/[\\/]/).at(-1).startsWith('refatlas-smoke-run-')) throw new Error('临时目录超出本轮边界')
  await rm(directory, { recursive: true, force: true })
}
