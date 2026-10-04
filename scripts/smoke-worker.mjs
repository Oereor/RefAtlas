import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { runProcess } from './process.mjs'
import { readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { realDataSnapshot } from './source-explorer-data.mjs'

const root = resolve(import.meta.dirname, '..')
const mode = process.argv[2] ?? 'built'
if (!['built', 'dev', 'packaged'].includes(mode)) throw new Error('无效 smoke 模式')
if (!['win32-x64', 'darwin-arm64'].includes(process.platform + '-' + process.arch))
  throw new Error('不支持的验证平台')
const require = createRequire(import.meta.url)
const electron = mode === 'packaged' ? undefined : require('electron')
const reportDirectory = process.argv[3]
if (!reportDirectory) throw new Error('smoke worker 需要父进程提供临时目录')
const report = join(reportDirectory, 'report.json')
let server
try {
  const realBefore =
    process.env.REFATLAS_SOURCE_EXPLORER_REAL_DATA === '1' ? await realDataSnapshot(root) : null
  const env = {
    ...process.env,
    TEMP: reportDirectory,
    TMP: reportDirectory,
    TMPDIR: reportDirectory,
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  if (mode === 'dev') {
    const { build, resolveConfig } = await import('electron-vite')
    const { createServer } = await import('vite')
    await build({ root, mode: 'development' })
    const config = await resolveConfig({ root }, 'serve')
    server = await createServer({
      ...config.config.renderer,
      configFile: false,
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    const address = server.httpServer.address()
    env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:' + address.port
  }
  let command = electron
  let args = [root, '--smoke', '--smoke-report', report]
  if (mode === 'packaged') {
    command =
      process.platform === 'win32'
        ? resolve(root, 'dist/win-unpacked/RefAtlas.exe')
        : resolve(
            root,
            process.arch === 'arm64' ? 'dist/mac-arm64' : 'dist/mac',
            'RefAtlas.app/Contents/MacOS/RefAtlas',
          )
    args = ['--smoke', '--smoke-report', report]
  }
  if (process.env.REFATLAS_SOURCE_EXPLORER_REAL_DATA === '1') args.push('--explorer-real-data')
  if (!existsSync(command)) throw new Error('未找到 Electron 应用：' + command)
  await runProcess(command, args, {
    cwd: root,
    env,
    capture: true,
    ownGroup: false,
    timeoutMs: 90000,
  })
  const content = JSON.parse(await readFile(report, 'utf8'))
  if (realBefore) {
    const realAfter = await realDataSnapshot(root)
    if (JSON.stringify(realBefore) !== JSON.stringify(realAfter))
      throw new Error('外部仓库 HEAD/status/source fingerprint 发生变化')
    content.externalDataSafety = { unchanged: true, ...realAfter }
  }
  if (
    content.ok !== true ||
    content.platform !== process.platform ||
    content.arch !== process.arch ||
    content.packaged !== (mode === 'packaged')
  )
    throw new Error('smoke 结果或目标身份错误：' + JSON.stringify(content))
  if (
    content.security?.contextIsolation !== true ||
    content.security?.nodeIntegration !== false ||
    content.security?.sandbox !== true
  )
    throw new Error('实际 BrowserWindow 安全配置验证失败')
  if (mode === 'packaged' && !content.renderer.sqlite.every((result) => result.nativeUnpacked))
    throw new Error('native addon 未验证在 ASAR 外加载')
  if (
    !content.renderer.localization ||
    content.renderer.localization.runtimeNavigations !== 0 ||
    content.renderer.localization.fixtureReloads !== 3
  )
    throw new Error('localization 无 reload / persistence fixture 证明缺失')
  if (
    !Array.isArray(content.renderer.explorer) ||
    !content.renderer.explorer.some((stage) => stage.stage === 'end') ||
    content.renderer.consoleErrors?.length !== 0
  )
    throw new Error('Source Explorer UI/keyboard/console 证明缺失')
  if (
    process.env.REFATLAS_SOURCE_EXPLORER_REAL_DATA === '1' &&
    !content.renderer.explorer.some((stage) => stage.stage === 'real-data')
  )
    throw new Error('真实 Source Explorer/controller/virtualization gate 缺失')
  if (
    !Array.isArray(content.renderer.nodeBrowser) ||
    ![
      'flow',
      'stale',
      'narrow',
      'root-kinds',
      'reload-survives',
      'location-missing',
      'return-root',
      'reload-error',
      'reload-error-retry',
      'monitor-paused',
      'monitor-resumed',
    ].every((stage) => content.renderer.nodeBrowser.some((result) => result.stage === stage))
  )
    throw new Error('NodeBrowser UI/stale/layout 证明缺失')
  if (
    process.env.REFATLAS_SOURCE_EXPLORER_REAL_DATA === '1' &&
    !content.renderer.nodeBrowser.some((result) => result.stage === 'real-data')
  )
    throw new Error('真实 NodeBrowser/controller/UI gate 缺失')
  const forbiddenRuntime =
    /@inlang|@lix-js|unplugin-paraglide-js|Fallback ready|源文件已发生变化，请重新加载。|@zag-js|@tanstack|TREE\.TYPEAHEAD|BRANCH_NODE\.ARROW/
  if (mode !== 'dev') {
    for (const folder of ['main', 'preload']) {
      const files = await readdir(resolve(root, 'out', folder), { recursive: true })
      for (const file of files.filter((entry) => entry.endsWith('.cjs')))
        if (forbiddenRuntime.test(await readFile(resolve(root, 'out', folder, file), 'utf8')))
          throw new Error('非 Renderer bundle 包含 localization runtime/compiler：' + file)
    }
    const assets = await readdir(resolve(root, 'out/renderer/assets'))
    content.localizationBundle = {
      rendererOnly: true,
      assets: await Promise.all(
        assets
          .filter((file) => file.endsWith('.js'))
          .map(async (name) => {
            const bytes = await readFile(resolve(root, 'out/renderer/assets', name))
            return { name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length }
          }),
      ),
    }
  }
  if (mode === 'packaged') {
    const resources =
      process.platform === 'win32'
        ? resolve(root, 'dist/win-unpacked/resources')
        : resolve(
            root,
            process.arch === 'arm64' ? 'dist/mac-arm64' : 'dist/mac',
            'RefAtlas.app/Contents/Resources',
          )
    const archive = join(resources, 'app.asar')
    const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
    const asarRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
    const asar = asarRequire('@electron/asar')
    const entries = asar
      .listPackage(archive)
      .map((entry) => entry.replace(/\\/g, '/').replace(/^\//, ''))
    if (
      entries.some(
        (entry) =>
          !['out', 'node_modules', 'package.json'].includes(entry) &&
          !entry.startsWith('out/') &&
          !entry.startsWith('node_modules/'),
      ) ||
      entries.some((entry) => /(^|\/)TurnBasedGameData(\/|$)/.test(entry))
    )
      throw new Error('ASAR 包含非运行时文件或外部数据')
    if (
      entries.some((entry) =>
        /(^|\/)(@inlang|@lix-js|@zag-js|@tanstack|svelte|@sveltejs|project\.inlang|\.cache|messages)(\/|$)/.test(
          entry,
        ),
      )
    )
      throw new Error('ASAR 包含 compiler SDK、catalog 源文件或插件缓存')
    for (const entry of entries.filter((entry) => /^out\/(main|preload)\/.+\.cjs$/.test(entry))) {
      if (
        forbiddenRuntime.test(asar.extractFile(archive, join(...entry.split('/'))).toString('utf8'))
      )
        throw new Error('ASAR 非 Renderer 入口包含 localization runtime：' + entry)
    }
    for (const entry of [
      'out/main/index.cjs',
      'out/preload/index.cjs',
      'out/renderer/index.html',
    ]) {
      if (!entries.includes(entry)) throw new Error('ASAR 缺少生产入口：' + entry)
    }
    const nativeFile = join(
      'node_modules',
      'better-sqlite3',
      'prebuilds',
      process.platform + '-' + process.arch + '.node',
    )
    if (
      !asar.statFile(archive, nativeFile).unpacked ||
      !existsSync(join(archive + '.unpacked', nativeFile))
    )
      throw new Error('ASAR native 解包文件验证失败')
    content.packageContents = {
      runtimeOnly: true,
      externalDataExcluded: true,
      nativeUnpacked: true,
      compilerExcluded: true,
      pluginCacheExcluded: true,
      catalogsRendererOnly: true,
      explorerRendererOnly: true,
    }
    const guardReport = join(reportDirectory, 'guard-report.json')
    await runProcess(command, ['--guard-smoke', '--smoke-report', guardReport], {
      cwd: root,
      env,
      capture: true,
      ownGroup: false,
      timeoutMs: 90000,
    })
    const guard = JSON.parse(await readFile(guardReport, 'utf8'))
    if (!guard.ok || !guard.packaged || guard.renderer.diagnostics !== false)
      throw new Error('普通打包态的诊断保护验证失败')
    content.normalModeGuard = guard.renderer
  }
  content.measuredAt = new Date().toISOString()
  content.mode = mode
  await mkdir(resolve(root, 'artifacts'), { recursive: true })
  const saved = resolve(
    root,
    'artifacts/foundation-' + mode + '-' + process.platform + '-' + process.arch + '.json',
  )
  await writeFile(saved, JSON.stringify(content, null, 2), 'utf8')
  console.log('smoke passed: ' + mode + ' ' + process.platform + '/' + process.arch)
  console.log('checks: ' + content.renderer.checks.join(', '))
  console.log('report: ' + saved)
} catch (error) {
  if (existsSync(report)) console.error(await readFile(report, 'utf8'))
  console.error(error)
  process.exitCode = 1
} finally {
  await server?.close()
}
