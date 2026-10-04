import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { cpus, release, totalmem } from 'node:os'
import { once } from 'node:events'
import {
  bounded,
  CHANNELS,
  exact,
  failure,
  FoundationError,
  object,
  SECURITY_CHANNEL,
  validId,
  validProbe,
} from '../shared/protocol'
import type { Result } from '../shared/protocol'
import { DataService } from './data-service'
import {
  commandFromInput,
  RAW_CHANNELS,
  RAW_LIMITS,
  RawError,
  rawFailure,
  rawBounded,
} from '../shared/raw'
import type { RawCode, RawResult } from '../shared/raw'
import { normalizeSystemLocale, UI_LOCALE_ARGUMENT } from '../shared/presentation'

const guardSmoke = process.argv.includes('--guard-smoke')
const smoke = process.argv.includes('--smoke') || guardSmoke
const diagnostics =
  !app.isPackaged ||
  process.argv.includes('--smoke') ||
  process.argv.includes('--foundation-validation')
const service = new DataService(diagnostics)
const security = Object.freeze({ contextIsolation: true, nodeIntegration: false, sandbox: true })
let window: BrowserWindow | null = null
let trustedUrl = ''
let preloadSecurity: unknown = null
let securitySourceUrl = ''
if (smoke) {
  ipcMain.on(SECURITY_CHANNEL, (event, input: unknown) => {
    if (
      !window ||
      window.isDestroyed() ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      !bounded(input)
    )
      return
    preloadSecurity = input
    securitySourceUrl = event.senderFrame.url
  })
}
let quitting = false
const reportIndex = process.argv.indexOf('--smoke-report')
const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : undefined
if (smoke && reportPath) {
  const userData = join(dirname(reportPath), 'user-data')
  mkdirSync(userData, { recursive: true })
  app.setPath('userData', userData)
}

function trusted(event: IpcMainInvokeEvent): boolean {
  return Boolean(
    window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === trustedUrl,
  )
}
function register(
  channel: string,
  count: number,
  action: (event: IpcMainInvokeEvent, args: unknown[]) => Promise<unknown> | unknown,
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<Result<unknown>> => {
    if (!trusted(event) || args.length !== count || !bounded(args))
      return failure('INVALID_INPUT', '无效调用来源或参数')
    try {
      return { ok: true, value: await action(event, args) }
    } catch (error) {
      if (error instanceof FoundationError) return failure(error.code, error.message)
      console.error(error)
      return failure('INTERNAL', '基础设施操作失败')
    }
  })
}
function requireDiagnostics(): void {
  if (!diagnostics) throw new FoundationError('TEST_ONLY', '仅诊断模式允许故障注入')
}

let choosingWorkspace = false
// Native picker substitution is confined to explicit smoke mode, never exposed through IPC.
let smokeWorkspaceSelections: (string | null)[] = []
function registerRaw(
  channel: string,
  action: (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>,
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<RawResult<unknown>> => {
    if (!trusted(event) || args.length !== 1 || !rawBounded(args, RAW_LIMITS.requestBytes))
      return rawFailure('INVALID_INPUT')
    try {
      const value = await action(event, args[0])
      const result = { ok: true as const, value }
      if (!rawBounded(result)) return rawFailure('RESOURCE_LIMIT', { limit: 'RESPONSE_BYTES' })
      return result
    } catch (error) {
      if (error instanceof RawError) return rawFailure(error.code, error.details)
      if (error instanceof FoundationError) return rawFailure(error.code as RawCode)
      return rawFailure('INTERNAL')
    }
  })
}
registerRaw(RAW_CHANNELS.open, async (event, input) => {
  if (!object(input) || !exact(input, ['requestId']) || !validId(input.requestId))
    throw new RawError('INVALID_INPUT')
  if (choosingWorkspace) throw new RawError('BUSY')
  choosingWorkspace = true
  try {
    const fixtureSelection = smokeWorkspaceSelections.length
      ? smokeWorkspaceSelections.shift()
      : reportPath
        ? join(dirname(reportPath), 'raw-fixtures')
        : null
    const selection =
      smoke && !guardSmoke && reportPath
        ? {
            canceled: fixtureSelection === null,
            filePaths: fixtureSelection ? [fixtureSelection] : [],
          }
        : await dialog.showOpenDialog(window!, { properties: ['openDirectory'] })
    if (selection.canceled) return { status: 'cancelled' }
    if (!trusted(event)) throw new RawError('CANCELLED')
    return await service.request(
      {
        type: 'request',
        id: input.requestId,
        operation: 'raw',
        input: { kind: 'open', root: selection.filePaths[0] },
      },
      event.sender.id,
    )
  } finally {
    choosingWorkspace = false
  }
})
for (const kind of [
  'close',
  'info',
  'reload',
  'read',
  'children',
  'segment',
  'directory',
  'release',
] as const)
  registerRaw(RAW_CHANNELS[kind], async (event, input) => {
    const command = commandFromInput(kind, input)
    if (!command || !object(input)) throw new RawError('INVALID_INPUT')
    return service.request(
      { type: 'request', id: input.requestId as string, operation: 'raw', input: command },
      event.sender.id,
    )
  })
registerRaw(RAW_CHANNELS.cancel, async (event, input) => {
  if (!validId(input)) throw new RawError('INVALID_INPUT')
  return service.cancel(input, event.sender.id)
})

register(CHANNELS.status, 0, () => service.status())
register(CHANNELS.probe, 1, (event, args) => {
  if (!validProbe(args[0]))
    throw new FoundationError('INVALID_INPUT', 'Probe 参数超过边界或类型错误')
  return service.request(
    { type: 'request', id: args[0].requestId, operation: 'probe', input: args[0] },
    event.sender.id,
  )
})
register(CHANNELS.cancel, 1, (event, args) => {
  if (!validId(args[0])) throw new FoundationError('INVALID_INPUT', '无效请求 ID')
  return service.cancel(args[0], event.sender.id)
})
register(CHANNELS.sqlite, 0, (event) =>
  service.request({ type: 'request', id: randomUUID(), operation: 'sqlite' }, event.sender.id),
)
register(CHANNELS.restart, 0, async () => {
  requireDiagnostics()
  return service.restart()
})
register(CHANNELS.crash, 0, async (event) => {
  requireDiagnostics()
  try {
    await service.request(
      { type: 'request', id: randomUUID(), operation: 'crash' },
      event.sender.id,
    )
  } catch (error) {
    if (error instanceof FoundationError && error.code === 'SERVICE_EXIT') return { crashed: true }
    throw error
  }
  throw new FoundationError('PROTOCOL_ERROR', '故障注入没有导致服务退出')
})

async function emitReport(value: unknown): Promise<void> {
  if (!reportPath) throw new Error('smoke 模式需要 --smoke-report 路径')
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, JSON.stringify(value, null, 2), 'utf8')
}
async function launch(): Promise<void> {
  if (smoke && !guardSmoke && reportPath) {
    const root = join(dirname(reportPath), 'raw-fixtures')
    await mkdir(root, { recursive: true })
    await mkdir(join(root, 'nested'), { recursive: true })
    await writeFile(join(root, 'nested', 'child.json'), '1', 'utf8')
    const cancelDirectory = join(root, 'directory-cancel')
    await mkdir(cancelDirectory, { recursive: true })
    for (let i = 0; i < 400; i++) await mkdir(join(cancelDirectory, String(i)))
    await writeFile(
      join(root, 'sample.json'),
      '\uFEFF{"n":16752756560315677817,"z":-0,"d":1.00,"s":"16752756560315677817","a~b/c":"中文🙂\\uD800","entries":[' +
        Array.from({ length: 3000 }, (_, i) => String(i)).join(',') +
        '],"long":' +
        JSON.stringify('🙂中文'.repeat(10000)) +
        '}',
      'utf8',
    )
    await writeFile(join(root, 'cancel.json'), '[' + '0,'.repeat(1_000_000) + '0]', 'utf8')
    await writeFile(join(root, 'huge.json'), JSON.stringify('x'.repeat(512 * 1024)), 'utf8')
    await writeFile(join(root, 'bad.json'), '{"a":1,}', 'utf8')
    await writeFile(join(root, 'other.json'), '{"kind":"fixture"}', 'utf8')
    await writeFile(
      join(root, 'node-browser.json'),
      '{"n":16752756560315677817,"z":-0,"d":1.00,"a~b/c":{"":{"0":1e+3}},"entries":[' +
        Array.from({ length: 205 }, (_, i) => String(i)).join(',') +
        '],"long":' +
        JSON.stringify('🙂中文'.repeat(20000)) +
        ',"boolean":true,"null":null,"empty":{}}',
      'utf8',
    )
    const scalarRoots = join(root, 'node-browser-roots')
    await mkdir(scalarRoots)
    for (const [kind, text] of [
      ['object', '{}'],
      ['array', '[]'],
      ['number', '1.00'],
      ['string', '"中文🙂"'],
      ['boolean', 'true'],
      ['null', 'null'],
    ])
      await writeFile(join(scalarRoots, kind + '.json'), text, 'utf8')
    await writeFile(join(root, '说明🙂' + '长名称'.repeat(35) + '.json'), 'null', 'utf8')
    const large = join(root, 'large')
    await mkdir(large, { recursive: true })
    for (let offset = 0; offset < 5000; offset += 100)
      await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          writeFile(join(large, String(offset + index).padStart(5, '0') + '.json'), '0', 'utf8'),
        ),
      )
    const secondRoot = join(dirname(reportPath), 'explorer-second')
    await mkdir(secondRoot, { recursive: true })
    await writeFile(join(secondRoot, 'switched.json'), '{}', 'utf8')
  }
  await service.start()
  let initialLocale = normalizeSystemLocale(undefined)
  try {
    initialLocale = normalizeSystemLocale(app.getSystemLocale())
  } catch {}
  window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    // Exercise the same initially visible window as production. Electron's initially
    // hidden painting mode can report visible even after native minimize/hide.
    show: !guardSmoke,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      ...security,
      // Page Visibility must reflect hide/minimize in product and native smoke alike.
      backgroundThrottling: true,
      additionalArguments: [UI_LOCALE_ARGUMENT + initialLocale],
    },
  })
  const rendererErrors: string[] = []
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') rendererErrors.push(event.message.slice(0, 1000))
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  const owner = window.webContents.id
  window.webContents.once('destroyed', () => service.rejectOwner(owner))
  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged) {
    trustedUrl = new URL(smoke ? '?smoke=1' : '/', process.env.ELECTRON_RENDERER_URL).href
    await window.loadURL(trustedUrl)
  } else {
    await window.loadFile(
      join(__dirname, '../renderer/index.html'),
      smoke ? { query: { smoke: guardSmoke ? 'guard' : '1' } } : {},
    )
    trustedUrl = window.webContents.getURL()
  }
  if (!smoke) return
  const rendererReport: unknown = await window.webContents.executeJavaScript(
    guardSmoke ? 'window.runFoundationGuardSmoke()' : 'window.runFoundationSmoke()',
  )
  if (!guardSmoke && reportPath && object(rendererReport)) {
    const rawReports: unknown[] = []
    rawReports.push(await window.webContents.executeJavaScript('window.runRawSmoke("initial")'))
    await writeFile(join(dirname(reportPath), 'raw-fixtures/sample.json'), '{"n":2}', 'utf8')
    rawReports.push(await window.webContents.executeJavaScript('window.runRawSmoke("changed")'))
    await unlink(join(dirname(reportPath), 'raw-fixtures/sample.json'))
    rawReports.push(await window.webContents.executeJavaScript('window.runRawSmoke("deleted")'))
    rawReports.push(await window.webContents.executeJavaScript('window.runRawSmoke("restart")'))
    rendererReport.raw = rawReports
    let navigationCount = 0
    const countNavigation = (): void => {
      navigationCount += 1
    }
    window.webContents.on('did-start-navigation', countNavigation)
    const localization: unknown[] = []
    const initial = await window.webContents.executeJavaScript(
      'window.runLocalizationSmoke("initial")',
    )
    if (!object(initial) || initial.bootstrap !== initialLocale || navigationCount !== 0)
      throw new Error('locale bootstrap 或无 reload 验证失败')
    localization.push(initial)
    for (const stage of ['stored-zh', 'stored-en', 'stored-invalid']) {
      const loaded = once(window.webContents, 'did-finish-load')
      window.webContents.reload()
      await loaded
      const restored: unknown = await window.webContents.executeJavaScript(
        'window.runLocalizationSmoke(' + JSON.stringify(stage) + ')',
      )
      if (
        !object(restored) ||
        restored.bootstrap !== initialLocale ||
        restored.bootToken === initial.bootToken
      )
        throw new Error('locale persistence reload fixture 验证失败')
      localization.push(restored)
    }
    window.webContents.removeListener('did-start-navigation', countNavigation)
    rendererReport.localization = {
      stages: localization,
      runtimeNavigations: 0,
      fixtureReloads: navigationCount,
    }
    smokeWorkspaceSelections = [
      null,
      join(dirname(reportPath), 'raw-fixtures'),
      null,
      join(dirname(reportPath), 'explorer-second'),
    ]
    const explorerReports: unknown[] = []
    const explorerStage = async (stage: string) => {
      try {
        explorerReports.push(
          await window!.webContents.executeJavaScript(
            'window.runExplorerSmoke(' + JSON.stringify(stage) + ')',
          ),
        )
      } catch (error) {
        throw new Error(
          'Explorer stage ' +
            stage +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        )
      }
    }
    window.show()
    window.focus()
    window.webContents.focus()
    const key = (keyCode: string) => {
      window!.webContents.sendInputEvent({ type: 'keyDown', keyCode })
      window!.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    }
    await explorerStage('initial')
    key('Right')
    await explorerStage('expanded')
    key('Right')
    await explorerStage('entered')
    key('Space')
    await explorerStage('selected')
    key('Return')
    await explorerStage('activated')
    key('Up')
    await explorerStage('up')
    key('Down')
    await explorerStage('up-down')
    key('Left')
    await explorerStage('parent')
    key('Left')
    await explorerStage('collapsed')
    key('End')
    await explorerStage('end')
    key('Home')
    await explorerStage('home')
    await explorerStage('component-boundaries')
    await mkdir(resolve(process.cwd(), 'artifacts'), { recursive: true })
    await writeFile(
      resolve(
        process.cwd(),
        'artifacts/source-explorer-' +
          (process.env.ELECTRON_RENDERER_URL ? 'dev' : app.isPackaged ? 'packaged' : 'built') +
          '.png',
      ),
      (await window.webContents.capturePage()).toPNG(),
    )
    await explorerStage('switched')
    if (process.argv.includes('--explorer-real-data')) {
      smokeWorkspaceSelections = [resolve(process.cwd(), '../TurnBasedGameData')]
      await explorerStage('real-data')
    }
    smokeWorkspaceSelections = [join(dirname(reportPath), 'raw-fixtures')]
    const nodeReports: unknown[] = []
    let nodeNavigations = 0
    const nodeNavigation = () => nodeNavigations++
    window.webContents.on('did-start-navigation', nodeNavigation)
    const nodeStage = async (stage: string, visibilityAction?: 'minimize' | 'hide') => {
      try {
        const result: unknown = await window!.webContents.executeJavaScript(
          'window.runNodeBrowserSmoke(' + JSON.stringify(stage) + ')',
        )
        nodeReports.push(
          object(result)
            ? {
                ...result,
                ...(visibilityAction ? { visibilityAction } : {}),
                ...(stage.startsWith('monitor-')
                  ? {
                      nativeWindow: {
                        visible: window!.isVisible(),
                        minimized: window!.isMinimized(),
                        focused: window!.isFocused(),
                        throttling: window!.webContents.backgroundThrottling,
                      },
                    }
                  : {}),
              }
            : result,
        )
        return result
      } catch (error) {
        const visibility = stage.startsWith('monitor-')
          ? JSON.stringify({
              action: visibilityAction,
              visible: window!.isVisible(),
              minimized: window!.isMinimized(),
              focused: window!.isFocused(),
              throttling: window!.webContents.backgroundThrottling,
              rendererVisibility: await window!.webContents.executeJavaScript(
                'document.visibilityState',
              ),
            })
          : ''
        throw new Error(
          'NodeBrowser stage ' +
            stage +
            ': ' +
            (error instanceof Error ? error.message : String(error)) +
            visibility,
        )
      }
    }
    await nodeStage('initial')
    key('End')
    await nodeStage('table-end')
    key('Home')
    await nodeStage('table-home')
    key('Down')
    await nodeStage('selected')
    key('Up')
    await nodeStage('table-home')
    key('Down')
    await nodeStage('selected')
    key('Return')
    await nodeStage('scalar')
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Left', modifiers: ['alt'] })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Left', modifiers: ['alt'] })
    await nodeStage('parent')
    await nodeStage('flow')
    const screenshot = async (suffix: string) => {
      await window!.webContents.executeJavaScript(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      )
      const capture = await window!.webContents.capturePage()
      await writeFile(
        resolve(
          process.cwd(),
          'artifacts/node-browser-' +
            (process.env.ELECTRON_RENDERER_URL ? 'dev' : app.isPackaged ? 'packaged' : 'built') +
            suffix +
            '.png',
        ),
        capture.toPNG(),
      )
      nodeReports.push({
        stage: 'screenshot',
        suffix,
        window: window!.getBounds(),
        content: window!.getContentBounds(),
        physical: capture.getSize(),
      })
    }
    await screenshot('')
    window.setSize(900, 600)
    await nodeStage('narrow')
    await screenshot('-narrow')
    window.setSize(1280, 800)
    await nodeStage('root-kinds')
    await writeFile(join(dirname(reportPath), 'raw-fixtures/node-browser.json'), '{}', 'utf8')
    await nodeStage('stale')
    await screenshot('-stale')
    await writeFile(
      join(dirname(reportPath), 'raw-fixtures/node-browser.json'),
      '{"entries":[42],"a":{"b":1}}',
      'utf8',
    )
    await nodeStage('reload-survives')
    const scalarFixture = { entries: [42], a: { b: 1 }, long: '旧🙂'.repeat(30000) }
    await writeFile(
      join(dirname(reportPath), 'raw-fixtures/node-browser.json'),
      JSON.stringify(scalarFixture),
    )
    await nodeStage('scalar-prepare')
    scalarFixture.long = '新🙂'.repeat(30000)
    await writeFile(
      join(dirname(reportPath), 'raw-fixtures/node-browser.json'),
      JSON.stringify(scalarFixture),
    )
    await nodeStage('scalar-reload')
    await writeFile(join(dirname(reportPath), 'raw-fixtures/node-browser.json'), '{')
    await nodeStage('invalid-reload')
    await writeFile(
      join(dirname(reportPath), 'raw-fixtures/node-browser.json'),
      JSON.stringify(scalarFixture),
    )
    await nodeStage('scalar-retry')
    await nodeStage('prepare-location')
    await writeFile(join(dirname(reportPath), 'raw-fixtures/node-browser.json'), '{"a":{"b":2}}')
    await nodeStage('scalar-value-reload')
    await writeFile(
      join(dirname(reportPath), 'raw-fixtures/node-browser.json'),
      '{"a":{"c":2}}',
      'utf8',
    )
    await nodeStage('location-missing')
    window.setSize(900, 600)
    await screenshot('-location-missing')
    window.setSize(1280, 800)
    await nodeStage('return-root')
    await unlink(join(dirname(reportPath), 'raw-fixtures/node-browser.json'))
    await nodeStage('reload-error')
    await screenshot('-reload-error')
    await writeFile(
      join(dirname(reportPath), 'raw-fixtures/node-browser.json'),
      '{"a":{"c":3}}',
      'utf8',
    )
    await nodeStage('reload-error-retry')
    await writeFile(join(dirname(reportPath), 'raw-fixtures/node-browser.json'), '[{"id":1}]')
    await nodeStage('array-prepare')
    await writeFile(
      join(dirname(reportPath), 'raw-fixtures/node-browser.json'),
      '[{"id":2},{"id":1}]',
    )
    await nodeStage('array-reload')
    await writeFile(
      join(dirname(reportPath), 'raw-fixtures/node-browser.json'),
      JSON.stringify({ ['long-中文🙂'.repeat(40)]: { x: 1 } }),
    )
    await nodeStage('long-location-prepare')
    await writeFile(join(dirname(reportPath), 'raw-fixtures/node-browser.json'), '{}')
    window.setSize(900, 600)
    await nodeStage('long-location-missing')
    await screenshot('-long-location-missing')
    window.setSize(1280, 800)
    await nodeStage('long-return-root')
    for (const action of ['minimize', 'hide'] as const) {
      await nodeStage('monitor-visible')
      if (action === 'minimize') window.minimize()
      else window.hide()
      await nodeStage('monitor-paused', action)
      if (action === 'minimize') window.restore()
      else window.show()
      window.focus()
      await nodeStage('monitor-resumed', action)
    }
    window.webContents.removeListener('did-start-navigation', nodeNavigation)
    if (nodeNavigations !== 0) throw new Error('Slice E lifecycle caused page navigation')
    nodeReports.push({ stage: 'lifecycle-navigation', count: nodeNavigations })
    if (process.argv.includes('--explorer-real-data')) {
      smokeWorkspaceSelections = [resolve(process.cwd(), '../TurnBasedGameData')]
      await nodeStage('real-data')
    }
    rendererReport.nodeBrowser = nodeReports
    window.hide()
    rendererReport.explorer = explorerReports
    rendererReport.consoleErrors = rendererErrors
    if (rendererErrors.length)
      throw new Error('Renderer console errors: ' + rendererErrors.join('\n'))
  }
  if (
    !object(preloadSecurity) ||
    !exact(preloadSecurity, ['contextIsolation', 'sandbox']) ||
    securitySourceUrl !== trustedUrl ||
    !object(rendererReport)
  )
    throw new Error('未收到可信 Preload/Renderer 安全证明')
  const actualSecurity = {
    contextIsolation: preloadSecurity.contextIsolation,
    nodeIntegration: rendererReport.nodeIntegration,
    sandbox: preloadSecurity.sandbox,
  }
  if (
    actualSecurity.contextIsolation !== true ||
    actualSecurity.nodeIntegration !== false ||
    actualSecurity.sandbox !== true
  )
    throw new Error('实际窗口安全配置不符合基础边界')
  if (!bounded(rendererReport)) throw new Error('smoke 报告超过有界消息限制')
  await emitReport({
    ok: true,
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    versions: process.versions,
    environment: { os: release(), cpu: cpus()[0]?.model, memoryBytes: totalmem() },
    security: actualSecurity,
    renderer: rendererReport,
  })
  await service.stop()
  quitting = true
  app.exit(0)
}

app
  .whenReady()
  .then(launch)
  .catch(async (error) => {
    console.error(error)
    if (smoke)
      await emitReport({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }).catch(console.error)
    await service.stop().catch(console.error)
    quitting = true
    app.exit(1)
  })
app.on('window-all-closed', () => app.quit())
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  service.stop().then(
    () => app.exit(0),
    (error) => {
      console.error(error)
      app.exit(1)
    },
  )
})
