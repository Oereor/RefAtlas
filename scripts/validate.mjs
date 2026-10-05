import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { executeSteps, packageSteps, packagingEnvironment } from './package.mjs'

export function validationSteps(npmCli, platform, arch, realData = false) {
  if (!npmCli) throw new Error('请通过 npm run validate:foundation 执行')
  const npmStep = (name) => ({ name, args: [npmCli, 'run', name], timeoutMs: 150000 })
  const smokeStep = (mode) => ({
    name: 'smoke:' + mode,
    args: [resolve(import.meta.dirname, 'smoke.mjs'), mode],
    timeoutMs: realData ? 210000 : 150000,
  })
  const [build, builder] = packageSteps(platform, arch)
  return [
    {
      name: 'i18n offline compile',
      args: [resolve(import.meta.dirname, 'i18n-compile.mjs'), '--offline'],
      timeoutMs: 60000,
    },
    ...['format:check', 'typecheck', 'test', 'docs:check'].map(npmStep),
    ...(realData ? [npmStep('test:raw-data')] : []),
    smokeStep('dev'),
    build,
    smokeStep('built'),
    builder,
    smokeStep('packaged'),
  ]
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some((argument) => argument !== '--real-data'))
    throw new Error('仅支持可选 --real-data gate')
  const steps = validationSteps(
    process.env.npm_execpath,
    process.platform,
    process.arch,
    process.argv.includes('--real-data'),
  )
  await executeSteps(steps, {
    ...(await packagingEnvironment(process.platform, process.arch)),
    REFATLAS_SOURCE_EXPLORER_REAL_DATA: process.argv.includes('--real-data') ? '1' : '0',
  })
}
