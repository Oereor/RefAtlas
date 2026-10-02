import { app, BrowserWindow, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cpus, release, totalmem } from 'node:os'
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
  await service.start()
  window = new BrowserWindow({
    width: 860,
    height: 640,
    show: !smoke,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      ...security,
      backgroundThrottling: false,
    },
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
