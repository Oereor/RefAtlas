<script lang="ts">
  import { onMount } from 'svelte'
  import type { Result, ServiceStatus } from '../../shared/protocol'
  let status = $state<ServiceStatus | null>(null)
  let frames = $state(0)
  let heartbeat = $state(0)
  let interactions = $state(0)
  let activeId = $state<string | null>(null)
  let output = $state('等待操作；本页面仅验证基础设施，不读取数据集。')
  const display = (result: Result<unknown>): void => {
    output = JSON.stringify(result, null, 2)
  }
  async function probe(): Promise<void> {
    const requestId = crypto.randomUUID()
    activeId = requestId
    try {
      display(
        await window.foundation.runCancelableProbe({ requestId, steps: 200, stepDelayMs: 20 }),
      )
    } finally {
      if (activeId === requestId) activeId = null
    }
  }
  onMount(() => {
    let frameId: number
    const tick = (): void => {
      frames += 1
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    const refresh = async (): Promise<void> => {
      const result = await window.foundation.getServiceStatus()
      if (result.ok) status = result.value
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 500)
    const heartbeatTimer = setInterval(() => (heartbeat += 1), 50)
    return () => {
      cancelAnimationFrame(frameId)
      clearInterval(timer)
      clearInterval(heartbeatTimer)
    }
  })
</script>

<main>
  <h1>Desktop Foundation</h1>
  <p>RefAtlas Phase 1A · 架构验证页面</p>
  <p>
    Data Service: <strong>{status?.state ?? 'starting'}</strong> · generation {status?.generation ??
      0}
  </p>
  <p>
    Renderer frames: <span id="frames">{frames}</span> · 交互计数：<span id="interactions"
      >{interactions}</span
    >
  </p>
  <p>Renderer heartbeat: <span id="heartbeat">{heartbeat}</span>（50 ms 定时更新）</p>
  <div class="actions">
    <button id="interaction" onclick={() => (interactions += 1)}>响应性计数 +1</button>
    <button onclick={() => void probe()} disabled={activeId !== null}>Cancelable IPC probe</button>
    <button
      onclick={() => activeId && void window.foundation.cancelProbe(activeId).then(display)}
      disabled={!activeId}>取消</button
    >
    <button onclick={() => void window.foundation.runSqliteSmoke().then(display)}
      >SQLite smoke</button
    >
    <button
      onclick={() => void window.foundation.crashDataServiceForTest().then(display)}
      disabled={!status?.diagnostics}>Crash test</button
    >
    <button
      onclick={() => void window.foundation.restartDataServiceForTest().then(display)}
      disabled={!status?.diagnostics}>Restart test</button
    >
  </div>
  <pre aria-live="polite">{output}</pre>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    color: #243244;
    background: #f6f7f9;
  }
  main {
    max-width: 780px;
    padding: 28px;
    margin: auto;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  button {
    padding: 9px 12px;
    cursor: pointer;
  }
  button:disabled {
    cursor: default;
  }
  pre {
    padding: 16px;
    background: white;
    border: 1px solid #d6dce4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
