import type { Result, ServiceStatus, SqliteResult } from '../../shared/protocol'

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function value<Value>(result: Result<Value>): Value {
  assert(result.ok, JSON.stringify(result))
  return result.value
}

export async function runFoundationGuardSmoke(): Promise<unknown> {
  assert(typeof window.runExplorerSmoke === 'undefined', '普通打包态不得暴露 explorer smoke')
  assert(typeof window.runNodeBrowserSmoke === 'undefined', '普通打包态不得暴露 NodeBrowser smoke')
  assert(
    typeof window.runLocalizationSmoke === 'undefined',
    '普通打包态不得暴露 localization smoke',
  )
  for (const name of ['require', 'process', 'Buffer'])
    assert(
      typeof (window as unknown as Record<string, unknown>)[name] === 'undefined',
      'Renderer 不得拥有 Node API: ' + name,
    )
  const status = value(await window.foundation.getServiceStatus())
  assert(!status.diagnostics && status.state === 'running', '普通打包态不得启用诊断')
  for (const result of [
    await window.foundation.crashDataServiceForTest(),
    await window.foundation.restartDataServiceForTest(),
  ]) {
    assert(!result.ok && result.error.code === 'TEST_ONLY', '普通打包态必须拒绝故障注入')
  }
  assert(
    value(
      await window.foundation.runCancelableProbe({
        requestId: crypto.randomUUID(),
        steps: 1,
        stepDelayMs: 1,
      }),
    ).completedSteps === 1,
    '普通打包态正常请求必须可用',
  )
  assert(
    value(await window.foundation.getServiceStatus()).generation === status.generation,
    '拒绝故障注入后代次不得变化',
  )
  return {
    checks: ['normal-packaged-diagnostics-denied', 'normal-packaged-probe'],
    diagnostics: false,
    nodeIntegration: false,
  }
}

export async function runFoundationSmoke(): Promise<unknown> {
  const bridge = window.foundation
  for (const name of ['require', 'process', 'Buffer'])
    assert(
      typeof (window as unknown as Record<string, unknown>)[name] === 'undefined',
      'Renderer 不得拥有 Node API: ' + name,
    )
  assert(
    Object.keys(bridge).sort().join(',') ===
      [
        'getServiceStatus',
        'runCancelableProbe',
        'cancelProbe',
        'runSqliteSmoke',
        'crashDataServiceForTest',
        'restartDataServiceForTest',
      ]
        .sort()
        .join(','),
    'bridge 必须保持窄接口',
  )
  const initial: ServiceStatus = value(await bridge.getServiceStatus())
  assert(initial.state === 'running' && initial.runtime?.electron, 'Utility ready 握手失败')
  const invalid = await bridge.runCancelableProbe({
    requestId: crypto.randomUUID(),
    steps: 1001,
    stepDelayMs: 1,
  })
  assert(!invalid.ok && invalid.error.code === 'INVALID_INPUT', '输入上限必须拒绝')
  const extra = await bridge.runCancelableProbe({
    requestId: crypto.randomUUID(),
    steps: 1,
    stepDelayMs: 1,
    extra: true,
  } as never)
  assert(!extra.ok && extra.error.code === 'INVALID_INPUT', '未知字段必须拒绝')
  const roundTripMs: number[] = []
  for (let sample = 0; sample < 105; sample += 1) {
    const begin = performance.now()
    const result = value(
      await bridge.runCancelableProbe({ requestId: crypto.randomUUID(), steps: 1, stepDelayMs: 1 }),
    )
    assert(result.completedSteps === 1, '请求响应匹配失败')
    if (sample >= 5) roundTripMs.push(performance.now() - begin)
  }
  const sqlite: SqliteResult[] = []
  const sqliteMs: number[] = []
  for (let sample = 0; sample < 3; sample += 1) {
    const begin = performance.now()
    const result = value(await bridge.runSqliteSmoke())
    assert(
      result.rows === 2 &&
        result.unicode === '基础设施🙂' &&
        result.integerText === '16752756560315677817' &&
        result.cleaned,
      'SQLite 往返或清理失败',
    )
    sqlite.push(result)
    sqliteMs.push(performance.now() - begin)
  }
  const cancelMs: number[] = []
  for (let sample = 0; sample < 3; sample += 1) {
    const requestId = crypto.randomUUID()
    const pending = bridge.runCancelableProbe({ requestId, steps: 1000, stepDelayMs: 10 })
    await delay(40)
    const duplicate = await bridge.runCancelableProbe({ requestId, steps: 1, stepDelayMs: 1 })
    assert(!duplicate.ok && duplicate.error.code === 'INVALID_INPUT', '重复 ID 必须拒绝')
    const begin = performance.now()
    assert(value(await bridge.cancelProbe(requestId)).accepted, '取消必须被接受')
    const cancelled = await pending
    assert(!cancelled.ok && cancelled.error.code === 'CANCELLED', '已取消任务不能返回成功')
    cancelMs.push(performance.now() - begin)
    assert(!value(await bridge.cancelProbe(requestId)).accepted, '完成后的取消不得重复接受')
  }
  const frameTimes: number[] = []
  let previous = performance.now()
  let observing = true
  let frameId = 0
  const observe = (): void => {
    const current = performance.now()
    frameTimes.push(current - previous)
    previous = current
    if (observing) frameId = requestAnimationFrame(observe)
  }
  frameId = requestAnimationFrame(observe)
  const beforeFrames = Number(document.getElementById('frames')!.textContent)
  const beforeHeartbeat = Number(document.getElementById('heartbeat')!.textContent)
  const beforeClicks = Number(document.getElementById('interactions')!.textContent)
  const clickTimer = setInterval(() => document.getElementById('interaction')!.click(), 100)
  try {
    value(
      await bridge.runCancelableProbe({
        requestId: crypto.randomUUID(),
        steps: 120,
        stepDelayMs: 10,
      }),
    )
  } finally {
    observing = false
    cancelAnimationFrame(frameId)
    clearInterval(clickTimer)
  }
  await delay(30)
  const advancedFrames = Number(document.getElementById('frames')!.textContent) - beforeFrames
  const advancedHeartbeat =
    Number(document.getElementById('heartbeat')!.textContent) - beforeHeartbeat
  const advancedClicks = Number(document.getElementById('interactions')!.textContent) - beforeClicks
  assert(advancedHeartbeat >= 10 && advancedClicks >= 3, '数据工作时 Renderer 必须保持更新及交互')
  const restartMs: number[] = []
  const startupMs = [initial.startupMs]
  let generation = initial.generation
  for (let sample = 0; sample < 3; sample += 1) {
    const pending = bridge.runCancelableProbe({
      requestId: crypto.randomUUID(),
      steps: 1000,
      stepDelayMs: 10,
    })
    await delay(40)
    assert(value(await bridge.crashDataServiceForTest()).crashed, '故障注入失败')
    const invalidated = await pending
    assert(
      !invalidated.ok && invalidated.error.code === 'SERVICE_EXIT',
      '崩溃必须结束 pending 请求',
    )
    const exitDeadline = performance.now() + 3000
    let exitStatus = value(await bridge.getServiceStatus())
    while (exitStatus.state !== 'stopped' && performance.now() < exitDeadline) {
      await delay(10)
      exitStatus = value(await bridge.getServiceStatus())
    }
    assert(
      exitStatus.state === 'stopped',
      'Main 未在 3 秒内观察服务退出，最后状态：' + exitStatus.state,
    )
    const unavailable = await bridge.runCancelableProbe({
      requestId: crypto.randomUUID(),
      steps: 1,
      stepDelayMs: 1,
    })
    assert(
      !unavailable.ok && unavailable.error.code === 'SERVICE_UNAVAILABLE',
      '退出后不能自动重放请求',
    )
    const begin = performance.now()
    const restarted = value(await bridge.restartDataServiceForTest())
    restartMs.push(performance.now() - begin)
    assert(restarted.state === 'running' && restarted.generation > generation, '重启代次必须变化')
    generation = restarted.generation
    startupMs.push(restarted.startupMs)
    assert(
      value(
        await bridge.runCancelableProbe({
          requestId: crypto.randomUUID(),
          steps: 1,
          stepDelayMs: 1,
        }),
      ).completedSteps === 1,
      '重启后请求必须恢复',
    )
  }
  return {
    checks: [
      'renderer-no-node',
      'narrow-bridge',
      'input-bounds',
      'ready-handshake',
      'message-port',
      'matching',
      'duplicate-id',
      'sqlite',
      'cancellation',
      'crash-pending',
      'restart',
      'responsiveness',
    ],
    runtime: initial.runtime,
    nodeIntegration: false,
    startupMs,
    roundTripMs,
    sqliteMs,
    sqlite,
    cancelMs,
    restartMs,
    responsiveness: {
      advancedFrames,
      advancedHeartbeat,
      advancedClicks,
      frameSamples: frameTimes.length,
      maxFrameGapMs: frameTimes.length ? Math.max(...frameTimes) : null,
    },
    timingNote:
      'roundTripMs 包含一次 1 ms Utility 定时步骤及 bridge；不是纯 MessagePort 延迟。缓存未清空；隐藏窗口 rAF 可降到约 1 Hz，响应性以心跳及 DOM 交互为证，不证明可见窗口帧率。',
  }
}
