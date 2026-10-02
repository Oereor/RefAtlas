import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import config from '../electron.vite.config'
const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
describe('foundation build boundaries', () => {
  it('bundles sandbox preload, emits CJS and uses the official utility entry', () => {
    expect(config.preload?.build?.externalizeDeps).toBe(false)
    expect(config.preload?.build?.rollupOptions?.output).toMatchObject({
      format: 'cjs',
      inlineDynamicImports: true,
      entryFileNames: '[name].cjs',
    })
    expect(config.main?.build?.rollupOptions?.output).toMatchObject({
      format: 'cjs',
      entryFileNames: '[name].cjs',
    })
    expect(read('src/main/data-service.ts')).toMatch(
      /import\s+\w+\s+from\s+['"][^'"]+\?modulePath['"]/,
    )
  })
  it('requires ASAR, the native unpack rule and a narrow application file list', () => {
    const config = read('electron-builder.yml')
    expect(config).toMatch(/^asar:[ \t]*true[ \t]*$/m)
    expect(config).toMatch(/^npmRebuild:[ \t]*false[ \t]*$/m)
    expect(config).toMatch(
      /^asarUnpack:\r?\n[ \t]+-[ \t]+node_modules\/better-sqlite3\/prebuilds\/\*\.node[ \t]*$/m,
    )
    const files = config.match(/^files:\r?\n((?:[ \t]+[^\r\n]*\r?\n)+)/m)?.[1]
    expect(
      files
        ?.trim()
        .split(/\r?\n/)
        .map((line) => line.trim()),
    ).toEqual(['- out/**', '- package.json'])
  })
})
