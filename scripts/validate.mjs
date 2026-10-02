import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { executeSteps, packageSteps, packagingEnvironment } from './package.mjs'

export function validationSteps(npmCli, platform, arch) {
  if (!npmCli) throw new Error('请通过 npm run validate:foundation 执行')
  const npmStep = (name) => ({ name, args: [npmCli, 'run', name], timeoutMs: 150000 })
  const [build, builder] = packageSteps(platform, arch)
  return [
    ...['format:check', 'typecheck', 'test', 'docs:check', 'smoke:dev'].map(npmStep),
    build,
    npmStep('smoke:built'),
    builder,
    npmStep('smoke:packaged'),
  ]
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const steps = validationSteps(process.env.npm_execpath, process.platform, process.arch)
  await executeSteps(steps, await packagingEnvironment(process.platform, process.arch))
}
