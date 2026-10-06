import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// This opt-in gate reads external metadata/content; it never writes into the source workspace.
export async function realDataSnapshot(appRoot) {
  const root = resolve(appRoot, '../TurnBasedGameData')
  const git = async (args) =>
    (
      await promisify(execFile)('git', ['-c', 'safe.directory=' + root, '-C', root, ...args])
    ).stdout.trim()
  const samples = [
    'ExcelOutput/AvatarConfig.json',
    'ExcelOutput/EquipmentConfig.json',
    'ExcelOutput/AvatarSkillConfig.json',
    'ExcelOutput/MonsterConfig.json',
    'TextMap/TextMapCHS.json',
    'Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json',
    'Config/SoundBankLookUp.json',
  ]
  const fingerprints = []
  for (const path of samples) {
    const meta = await stat(resolve(root, path)),
      hash = createHash('sha256')
    for await (const chunk of createReadStream(resolve(root, path))) hash.update(chunk)
    fingerprints.push({ path, hash: hash.digest('hex'), size: meta.size, mtimeMs: meta.mtimeMs })
  }
  return {
    head: await git(['rev-parse', 'HEAD']),
    status: await git(['status', '--porcelain']),
    fingerprints,
  }
}
