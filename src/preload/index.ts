import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, failure, SECURITY_CHANNEL, validId, validProbe } from '../shared/protocol'
import type { FoundationBridge, ProbeInput } from '../shared/protocol'
import { commandFromInput, RAW_CHANNELS, rawFailure } from '../shared/raw'
import { exact, object } from '../shared/protocol'
import type { RawBridge, RawCommand } from '../shared/raw'

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
const invokeRaw = (kind: Exclude<RawCommand['kind'], 'open'>, input: unknown) =>
  commandFromInput(kind, input)
    ? ipcRenderer.invoke(RAW_CHANNELS[kind === 'info' ? 'info' : kind], input)
    : Promise.resolve(rawFailure('INVALID_INPUT'))
const raw: RawBridge = Object.freeze<RawBridge>({
  openWorkspace: (input) =>
    object(input) && exact(input, ['requestId']) && validId(input.requestId)
      ? ipcRenderer.invoke(RAW_CHANNELS.open, input)
      : Promise.resolve(rawFailure('INVALID_INPUT')),
  closeWorkspace: (input) => invokeRaw('close', input),
  getSourceInfo: (input) => invokeRaw('info', input),
  reloadSource: (input) => invokeRaw('reload', input),
  readNode: (input) => invokeRaw('read', input),
  listNodeChildren: (input) => invokeRaw('children', input),
  readScalarSegment: (input) => invokeRaw('segment', input),
  cancelRequest: (id) =>
    validId(id)
      ? ipcRenderer.invoke(RAW_CHANNELS.cancel, id)
      : Promise.resolve(rawFailure('INVALID_INPUT')),
})
contextBridge.exposeInMainWorld('raw', raw)
ipcRenderer.send(SECURITY_CHANNEL, {
  contextIsolation: process.contextIsolated,
  sandbox: process.sandboxed,
})
