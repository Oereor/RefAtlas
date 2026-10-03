import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CompilerOptions } from '@inlang/paraglide-js'

export const pluginResource = Object.freeze({
  url: 'https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.4.0/dist/index.js',
  sha256: '9486558801c08ebb018223c51c2044b6c3c23fc2a8c0e7894a57882b34feb6ca',
  path: resolve(import.meta.dirname, '.cache/i18n/message-format-4.4.0.js'),
  maxBytes: 512 * 1024,
})

export function verifyPlugin(bytes: Uint8Array): void {
  if (
    bytes.byteLength > pluginResource.maxBytes ||
    createHash('sha256').update(bytes).digest('hex') !== pluginResource.sha256
  )
    throw new Error('message-format 4.4.0 插件校验失败；禁止使用未验证缓存')
}

export function requirePlugin(): void {
  try {
    verifyPlugin(readFileSync(pluginResource.path))
  } catch (error) {
    throw new Error('需要已验证的本地 i18n 插件；先运行 npm run i18n:prepare', { cause: error })
  }
}

export const paraglideOptions = {
  project: resolve(import.meta.dirname, 'project.inlang'),
  outdir: resolve(import.meta.dirname, 'src/renderer/src/i18n/generated'),
  strategy: ['globalVariable', 'baseLocale'],
  emitTsDeclarations: true,
  disableAsyncLocalStorage: true,
  isServer: 'false',
  emitReadme: false,
} satisfies CompilerOptions
