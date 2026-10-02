import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFile, access } from 'node:fs/promises'
import { runProcess } from './process.mjs'
import { proxyEnvironment } from './proxy.mjs'

const root = resolve(import.meta.dirname, '..')
export function packageSteps(platform, arch) {
  if (!['win32-x64', 'darwin-x64', 'darwin-arm64'].includes(platform + '-' + arch))
    throw new Error('不支持的验证目标')
  return [
    {
      name: 'production build',
      args: [resolve(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'],
      timeoutMs: 120000,
    },
    {
      name: 'builder',
      args: [
        resolve(root, 'node_modules/electron-builder/cli.js'),
        '--dir',
        platform === 'win32' ? '--win' : '--mac',
        '--' + arch,
        '--publish',
        'never',
        '--config.electronDist=node_modules/electron/dist',
      ],
      timeoutMs: 300000,
    },
  ]
}

export async function packagingEnvironment(platform, arch) {
  packageSteps(platform, arch)
  if (platform !== process.platform || arch !== process.arch)
    throw new Error('平台 gate 必须在对应原生 OS/架构上构建和运行')
  const env = {
    ...(await proxyEnvironment()),
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    ELECTRON_BUILDER_CACHE: resolve(root, '.cache/builder'),
  }
  const driver = JSON.parse(
    await readFile(resolve(root, 'node_modules/better-sqlite3/package.json'), 'utf8'),
  )
  if (driver.version !== '13.0.3') throw new Error('驱动版本变化，必须重新验证 N-API 与打包策略')
  await access(
    resolve(root, 'node_modules/better-sqlite3/prebuilds', platform + '-' + arch + '.node'),
  )
  return env
}

export async function executeSteps(steps, env, execute = runProcess) {
  for (const [index, step] of steps.entries()) {
    console.log('[' + (index + 1) + '/' + steps.length + '] ' + step.name)
    await execute(process.execPath, step.args, { cwd: root, env, timeoutMs: step.timeoutMs })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [platform = process.platform, arch = process.arch] = process.argv.slice(2)
  await executeSteps(packageSteps(platform, arch), await packagingEnvironment(platform, arch))
}
