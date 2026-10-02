import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxyEnvironment } from '../scripts/proxy.mjs'
import { runProcess } from '../scripts/process.mjs'

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
    await expect(runProcess(process.execPath, ['-e', 'process.exit(7)'], { capture: true })).rejects.toThrow('7')
  })
  it('times out and reaps its own child process', async () => {
    await expect(runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100, capture: true })).rejects.toThrow('超时')
  })
})
