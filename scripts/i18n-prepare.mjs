import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pluginResource, verifyPlugin } from '../i18n.config.ts'
import { proxyEnvironment } from './proxy.mjs'
import { runProcess } from './process.mjs'

export async function preparePlugin() {
  try {
    verifyPlugin(await readFile(pluginResource.path))
    return
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  console.log('准备固定 message-format 4.4.0 插件（仅经 7890 代理）')
  await runProcess(process.execPath, ['--use-env-proxy', import.meta.filename, '--download'], {
    env: await proxyEnvironment(),
    timeoutMs: 35000,
  })
}

async function downloadPlugin() {
  await proxyEnvironment()
  const response = await fetch(pluginResource.url, { signal: AbortSignal.timeout(25000) })
  if (!response.ok) throw new Error('固定 i18n 插件下载失败：' + response.status)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > pluginResource.maxBytes) throw new Error('i18n 插件超过资源预算')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = Buffer.concat(chunks)
  verifyPlugin(bytes)
  await mkdir(dirname(pluginResource.path), { recursive: true })
  const temporary = pluginResource.path + '.tmp'
  try {
    await writeFile(temporary, bytes)
    await rename(temporary, pluginResource.path)
  } finally {
    await rm(temporary, { force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === '--download') await downloadPlugin()
  else if (process.argv.length === 2) await preparePlugin()
  else throw new Error('无效 i18n:prepare 参数')
}
