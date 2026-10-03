import { validCommand, validRawResult } from './raw'
import type { RawCommand, RawOutput, RawResult } from './raw'
export const SECURITY_CHANNEL = 'foundation:preload-security'
export const LIMITS = Object.freeze({
  bytes: 16 * 1024,
  pending: 32,
  steps: 1000,
  durationMs: 10000,
  startupMs: 10000,
  requestMs: 20000,
})
export const CHANNELS = Object.freeze({
  status: 'foundation:status',
  probe: 'foundation:probe',
  cancel: 'foundation:cancel',
  sqlite: 'foundation:sqlite',
  crash: 'foundation:crash',
  restart: 'foundation:restart',
})
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'BUSY'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'SERVICE_EXIT'
  | 'SERVICE_UNAVAILABLE'
  | 'PROTOCOL_ERROR'
  | 'TEST_ONLY'
  | 'INTERNAL'
export type Result<Value> =
  { ok: true; value: Value } | { ok: false; error: { code: ErrorCode; message: string } }
export type ProbeInput = { requestId: string; steps: number; stepDelayMs: number }
export type ProbeResult = { completedSteps: number }
export type SqliteResult = {
  rows: number
  sqliteVersion: string
  unicode: string
  integerText: string
  cleaned: boolean
  nativeUnpacked: boolean
}
export type Runtime = { electron: string; node: string; napi: string; modules: string }
export type ServiceStatus = {
  state: 'starting' | 'running' | 'stopped'
  generation: number
  diagnostics: boolean
  runtime: Runtime | null
  startupMs: number
}
export interface FoundationBridge {
  getServiceStatus(): Promise<Result<ServiceStatus>>
  runCancelableProbe(input: ProbeInput): Promise<Result<ProbeResult>>
  cancelProbe(requestId: string): Promise<Result<{ accepted: boolean }>>
  runSqliteSmoke(): Promise<Result<SqliteResult>>
  crashDataServiceForTest(): Promise<Result<{ crashed: boolean }>>
  restartDataServiceForTest(): Promise<Result<ServiceStatus>>
}
export type Operation = 'probe' | 'sqlite' | 'cancel' | 'crash' | 'raw'
export type UtilityValue = ProbeResult | SqliteResult | { accepted: boolean } | RawOutput
export type Request =
  | { type: 'request'; id: string; operation: 'raw'; input: RawCommand }
  | { type: 'request'; id: string; operation: 'probe'; input: ProbeInput }
  | { type: 'request'; id: string; operation: 'sqlite' | 'crash' }
  | { type: 'request'; id: string; operation: 'cancel'; targetId: string }
export type Response = {
  type: 'response'
  id: string
  result: Result<UtilityValue> | RawResult<RawOutput>
}
export class FoundationError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}
export function failure(code: ErrorCode, message: string): Result<never> {
  return { ok: false, error: { code, message: message.slice(0, 240) } }
}
export function bounded(value: unknown): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= LIMITS.bytes
  } catch {
    return false
  }
}
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}
export function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}
export function validProbe(value: unknown): value is ProbeInput {
  return (
    object(value) &&
    exact(value, ['requestId', 'steps', 'stepDelayMs']) &&
    validId(value.requestId) &&
    Number.isInteger(value.steps) &&
    Number.isInteger(value.stepDelayMs) &&
    Number(value.steps) >= 1 &&
    Number(value.steps) <= LIMITS.steps &&
    Number(value.stepDelayMs) >= 1 &&
    Number(value.steps) * Number(value.stepDelayMs) <= LIMITS.durationMs
  )
}
export function validRequest(value: unknown): value is Request {
  if (!bounded(value) || !object(value) || value.type !== 'request' || !validId(value.id))
    return false
  if (value.operation === 'raw')
    return exact(value, ['type', 'id', 'operation', 'input']) && validCommand(value.input)
  if (value.operation === 'probe')
    return (
      exact(value, ['type', 'id', 'operation', 'input']) &&
      validProbe(value.input) &&
      value.id === value.input.requestId
    )
  if (value.operation === 'cancel')
    return exact(value, ['type', 'id', 'operation', 'targetId']) && validId(value.targetId)
  return (
    (value.operation === 'sqlite' || value.operation === 'crash') &&
    exact(value, ['type', 'id', 'operation'])
  )
}
export function validResult(
  value: unknown,
  operation: Operation,
  command?: RawCommand,
): value is Result<UtilityValue> | RawResult<RawOutput> {
  if (operation === 'raw') return Boolean(command && validRawResult(value, command))
  if (!object(value)) return false
  if (value.ok === false) {
    const codes: ErrorCode[] = [
      'INVALID_INPUT',
      'BUSY',
      'CANCELLED',
      'TIMEOUT',
      'SERVICE_EXIT',
      'SERVICE_UNAVAILABLE',
      'PROTOCOL_ERROR',
      'TEST_ONLY',
      'INTERNAL',
    ]
    return (
      exact(value, ['ok', 'error']) &&
      object(value.error) &&
      exact(value.error, ['code', 'message']) &&
      codes.includes(value.error.code as ErrorCode) &&
      typeof value.error.message === 'string' &&
      value.error.message.length <= 240
    )
  }
  if (value.ok !== true || !exact(value, ['ok', 'value']) || !object(value.value)) return false
  const result = value.value
  if (operation === 'probe')
    return (
      exact(result, ['completedSteps']) &&
      Number.isInteger(result.completedSteps) &&
      Number(result.completedSteps) >= 1 &&
      Number(result.completedSteps) <= LIMITS.steps
    )
  if (operation === 'cancel')
    return exact(result, ['accepted']) && typeof result.accepted === 'boolean'
  if (operation === 'sqlite')
    return (
      exact(result, [
        'rows',
        'sqliteVersion',
        'unicode',
        'integerText',
        'cleaned',
        'nativeUnpacked',
      ]) &&
      result.rows === 2 &&
      typeof result.sqliteVersion === 'string' &&
      result.sqliteVersion.length < 64 &&
      result.unicode === '基础设施🙂' &&
      result.integerText === '16752756560315677817' &&
      typeof result.cleaned === 'boolean' &&
      typeof result.nativeUnpacked === 'boolean'
    )
  return false
}
