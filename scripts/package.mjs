import { resolve } from 'node:path'
import { readFile, access } from 'node:fs/promises'
import { runProcess } from './process.mjs'
import { proxyEnvironment } from './proxy.mjs'

const root = resolve(import.meta.dirname, '..')
const [platform = process.platform, arch = process.arch] = process.argv.slice(2)
if (!['win32-x64', 'darwin-x64', 'darwin-arm64'].includes(platform + '-' + arch)) throw new Error('不支持的验证目标')
if (platform !== process.platform || arch !== process.arch) throw new Error('平台 gate 必须在对应原生 OS/架构上构建和运行')
const env = { ...await proxyEnvironment(), CSC_IDENTITY_AUTO_DISCOVERY: 'false', ELECTRON_BUILDER_CACHE: resolve(root, '.cache/builder') }
const driver = JSON.parse(await readFile(resolve(root, 'node_modules/better-sqlite3/package.json'), 'utf8'))
if (driver.version !== '13.0.3') throw new Error('驱动版本变化，必须重新验证 N-API 与打包策略')
await access(resolve(root, 'node_modules/better-sqlite3/prebuilds', platform + '-' + arch + '.node'))
await runProcess(process.execPath, [resolve(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'], { cwd: root, env })
await runProcess(process.execPath, [resolve(root, 'node_modules/electron-builder/cli.js'), '--dir', platform === 'win32' ? '--win' : '--mac', '--' + arch,
  '--publish', 'never', '--config.electronDist=node_modules/electron/dist'], { cwd: root, env, timeoutMs: 300000 })
