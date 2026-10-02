import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
describe('foundation build boundaries', () => {
  it('bundles sandbox preload, emits CJS and uses the official utility entry', () => {
    expect(read('electron.vite.config.ts')).toContain('externalizeDeps: false')
    expect(read('electron.vite.config.ts')).toContain("format: 'cjs'")
    expect(read('src/main/data-service.ts')).toContain('index.ts?modulePath')
    expect(read('src/main/index.ts')).toContain('contextIsolation: true, nodeIntegration: false, sandbox: true')
    expect(read('src/preload/index.ts')).toContain('process.sandboxed')
  })
  it('uses official ASAR unpack without bundling the investigation or dataset', () => {
    const config = read('electron-builder.yml')
    expect(config).toContain('asar: true')
    expect(config).toContain('node_modules/better-sqlite3/prebuilds/*.node')
    expect(config).toContain('npmRebuild: false')
    expect(config).not.toContain('tools/investigation')
    expect(config).not.toContain('TurnBasedGameData')
    expect(read('scripts/package.mjs')).toContain("'never'")
  })
})
