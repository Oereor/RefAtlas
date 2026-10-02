import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxyEnvironment } from '../scripts/proxy.mjs'
import { runProcess } from '../scripts/process.mjs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

afterEach(() => vi.unstubAllEnvs())
describe('local infrastructure runners', () => {
  it('does not permit a missing proxy or direct fallback', async () => {
    vi.stubEnv('HTTPS_PROXY', '')
    vi.stubEnv('https_proxy', '')
    await expect(proxyEnvironment()).rejects.toThrow('HTTPS_PROXY')
  })
  it('rejects an unconfirmed proxy port before opening a socket', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:7891')
    await expect(proxyEnvironment()).rejects.toThrow('7890')
  })
  it('reports a nonzero child exit rather than success', async () => {
    await expect(
      runProcess(process.execPath, ['-e', 'process.exit(7)'], { capture: true }),
    ).rejects.toThrow('7')
  })
  it('times out and reaps its own child process', async () => {
    const parent = resolve(tmpdir())
    const directory = await mkdtemp(join(parent, 'refatlas-runner-test-'))
    const pidFile = join(directory, 'child.pid')
    try {
      const script =
        "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)"
      await expect(
        runProcess(process.execPath, ['-e', script, pidFile], { timeoutMs: 1500, capture: true }),
      ).rejects.toThrow('超时')
      const childPid = Number(await readFile(pidFile, 'utf8'))
      expect(Number.isSafeInteger(childPid) && childPid > 0).toBe(true)
      expect(() => process.kill(childPid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
    } finally {
      if (dirname(resolve(directory)) !== parent) throw new Error('测试临时目录超出边界')
      await rm(directory, { recursive: true, force: true })
    }
  })
})
