import { resolve } from 'node:path'
import { proxyEnvironment } from './proxy.mjs'
import { runProcess } from './process.mjs'
const root = resolve(import.meta.dirname, '..')
const env = {
  ...(await proxyEnvironment()),
  electron_config_cache: resolve(root, '.cache/electron'),
}
await runProcess(process.execPath, [resolve(root, 'node_modules/electron/install.js')], {
  cwd: root,
  env,
  timeoutMs: 300000,
})
