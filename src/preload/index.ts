import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, failure, SECURITY_CHANNEL, validId, validProbe } from '../shared/protocol'
import type { FoundationBridge, ProbeInput } from '../shared/protocol'

if (!process.sandboxed || !process.contextIsolated) throw new Error('Preload 安全边界未启用')

const bridge: FoundationBridge = Object.freeze({
  getServiceStatus: () => ipcRenderer.invoke(CHANNELS.status),
  runCancelableProbe: (input: ProbeInput) =>
    validProbe(input)
      ? ipcRenderer.invoke(CHANNELS.probe, input)
      : Promise.resolve(failure('INVALID_INPUT', '无效 Probe 输入')),
  cancelProbe: (requestId: string) =>
    validId(requestId)
      ? ipcRenderer.invoke(CHANNELS.cancel, requestId)
      : Promise.resolve(failure('INVALID_INPUT', '无效请求 ID')),
  runSqliteSmoke: () => ipcRenderer.invoke(CHANNELS.sqlite),
  crashDataServiceForTest: () => ipcRenderer.invoke(CHANNELS.crash),
  restartDataServiceForTest: () => ipcRenderer.invoke(CHANNELS.restart),
})
contextBridge.exposeInMainWorld('foundation', bridge)
ipcRenderer.send(SECURITY_CHANNEL, {
  contextIsolation: process.contextIsolated,
  sandbox: process.sandboxed,
})
