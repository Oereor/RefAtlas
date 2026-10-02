import { createConnection } from 'node:net'

export async function proxyEnvironment() {
  const configured = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!configured)
    throw new Error('联网操作需要当前 shell 的 HTTPS_PROXY；先确认系统 7890 代理协议与地址')
  const proxy = new URL(configured)
  if (
    !['http:', 'https:'].includes(proxy.protocol) ||
    !['127.0.0.1', 'localhost'].includes(proxy.hostname) ||
    proxy.port !== '7890'
  )
    throw new Error('仅允许已确认的本机系统 7890 HTTP(S) 代理')
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: proxy.hostname, port: Number(proxy.port) })
    socket.setTimeout(3000)
    socket.once('connect', () => {
      socket.destroy()
      resolve()
    })
    socket.once('error', reject)
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error('7890 代理不可用；禁止直连回退'))
    })
  })
  return {
    ...process.env,
    HTTP_PROXY: configured,
    HTTPS_PROXY: configured,
    http_proxy: configured,
    https_proxy: configured,
    ALL_PROXY: configured,
    all_proxy: configured,
    NO_PROXY: 'localhost,127.0.0.1',
    no_proxy: 'localhost,127.0.0.1',
    npm_config_proxy: configured,
    npm_config_https_proxy: configured,
    npm_config_noproxy: 'localhost,127.0.0.1',
    ELECTRON_GET_USE_PROXY: 'true',
    NODE_USE_ENV_PROXY: '1',
    NO_UPDATE_NOTIFIER: '1',
  }
}
