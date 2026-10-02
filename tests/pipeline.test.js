import { describe, expect, it } from 'vitest'
import { executeSteps, packageSteps } from '../scripts/package.mjs'
import { validationSteps } from '../scripts/validate.mjs'

describe('foundation validation commands', () => {
  it.each([
    ['win32', 'x64', '--win'],
    ['darwin', 'x64', '--mac'],
    ['darwin', 'arm64', '--mac'],
  ])('always builds before standalone packaging for %s/%s', (platform, arch, flag) => {
    const steps = packageSteps(platform, arch)
    expect(steps.map((step) => step.name)).toEqual(['production build', 'builder'])
    expect(steps[0].args.at(-1)).toBe('build')
    expect(steps[1].args.slice(1)).toEqual([
      '--dir',
      flag,
      '--' + arch,
      '--publish',
      'never',
      '--config.electronDist=node_modules/electron/dist',
    ])
  })
  it('builds production once after dev smoke and before built smoke and packaging', async () => {
    const steps = validationSteps('npm-cli.js', 'win32', 'x64')
    const executed = []
    await executeSteps(steps, {}, async (command, args) => {
      expect(command).toBe(process.execPath)
      executed.push(args)
    })
    expect(executed).toEqual(steps.map((step) => step.args))
    expect(steps.map((step) => step.name)).toEqual([
      'format:check',
      'typecheck',
      'test',
      'docs:check',
      'smoke:dev',
      'production build',
      'smoke:built',
      'builder',
      'smoke:packaged',
    ])
  })
  it.each(['production build', 'smoke:built', 'builder'])(
    'stops after %s fails without executing later stages',
    async (failedStage) => {
      const steps = validationSteps('npm-cli.js', 'win32', 'x64')
      const failedIndex = steps.findIndex((step) => step.name === failedStage)
      const executed = []
      const failure = new Error('stage failed')
      await expect(
        executeSteps(steps, {}, async (_command, args) => {
          executed.push(args)
          if (args === steps[failedIndex].args) throw failure
        }),
      ).rejects.toBe(failure)
      expect(executed).toEqual(steps.slice(0, failedIndex + 1).map((step) => step.args))
    },
  )
})
