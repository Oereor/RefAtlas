import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import config from '../electron.vite.config'
import { paraglideOptions, pluginResource, verifyPlugin } from '../i18n.config'
const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
describe('foundation build boundaries', () => {
  it('keeps the i18n compiler in renderer with a verified local plugin and non-URL strategy', () => {
    const plugins = (config.renderer?.plugins ?? []).flat().filter(Boolean)
    expect(
      plugins.some(
        (plugin) =>
          typeof plugin === 'object' &&
          plugin !== null &&
          'name' in plugin &&
          plugin.name === 'unplugin-paraglide-js',
      ),
    ).toBe(true)
    expect(config.main?.plugins ?? []).toEqual([])
    expect(config.preload?.plugins ?? []).toEqual([])
    expect(paraglideOptions.strategy).toEqual(['globalVariable', 'baseLocale'])
    expect(paraglideOptions.emitTsDeclarations).toBe(true)
    expect(paraglideOptions.disableAsyncLocalStorage).toBe(true)
    const settings = JSON.parse(read('project.inlang/settings.json'))
    expect(settings.modules).toEqual(['./.cache/i18n/message-format-4.4.0.js'])
    expect(settings.locales).toEqual(['en', 'zh-CN'])
    expect(settings.baseLocale).toBe('en')
    expect(() => verifyPlugin(readFileSync(pluginResource.path))).not.toThrow()
    expect(() => verifyPlugin(new Uint8Array([0]))).toThrow()
  })
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
    ).toEqual([
      '- out/**',
      '- package.json',
      "- '!node_modules/{@zag-js,@tanstack,svelte,@jridgewell,@sveltejs,@types,acorn,aria-query,axobject-query,clsx,csstype,devalue,esm-env,esrap,is-reference,locate-character,magic-string,zimmerframe}/**'",
    ])
  })
})
