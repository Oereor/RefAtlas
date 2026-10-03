import { describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { RawDataService } from '../src/utility/raw-service'
import { byteSize, RAW_LIMITS } from '../src/shared/raw'
import type {
  ChildrenResult,
  JsonPointer,
  NodeAddress,
  NodeResult,
  RelativePath,
  SourceInfo,
  WorkspaceId,
} from '../src/shared/raw'

// 普通 npm test 离线且快速；真实来源验证必须由专用命令明确启用。
const enabled = process.env.REFATLAS_REAL_DATA === '1'
async function fingerprint(path: string): Promise<{ hash: string; size: number; mtimeMs: number }> {
  const meta = await stat(path),
    hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return { hash: hash.digest('hex'), size: meta.size, mtimeMs: meta.mtimeMs }
}
describe.skipIf(!enabled)('read-only production real-data gate', () => {
  it('validates six representative sources with lossless reads and bounded large-node access', async () => {
    const root = resolve(import.meta.dirname, '../../TurnBasedGameData')
    let work = { bytesRead: 0, tokens: 0 }
    const service = new RawDataService((metrics) => {
        work = metrics
      }),
      signal = new AbortController().signal
    const samples = [
      ['ExcelOutput/AvatarConfig.json', '/0', '/0/AvatarName/Hash', '6186714091647966180'],
      ['ExcelOutput/EquipmentConfig.json', '/56', '/56/BattleDialogOffset/1', '-0'],
      ['ExcelOutput/AvatarSkillConfig.json', '/0', '/0/SkillTag/Hash', '16752756560315677817'],
      ['TextMap/TextMapCHS.json', '', '', null],
      [
        'Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json',
        '/DimensionList',
        '/DimensionList/0/GroupList',
        null,
      ],
      ['Config/SoundBankLookUp.json', '/Events', '/Events/10000', null],
    ] as const
    const measurements = []
    try {
      const { workspaceId } = (await service.execute({ kind: 'open', root }, signal)) as {
        workspaceId: WorkspaceId
      }
      for (const [file, pointer, scalarPointer, lexeme] of samples) {
        const before = await fingerprint(resolve(root, file))
        const source = { workspaceId, relativePath: file as RelativePath }
        const metadata = (await service.execute({ kind: 'info', source }, signal)) as SourceInfo
        const address = { source, pointer: pointer as JsonPointer }
        const start = performance.now()
        const cold = (await service.execute(
          { kind: 'read', address, expectedRevision: metadata.revision },
          signal,
        )) as NodeResult
        const coldMs = performance.now() - start
        const coldWork = { ...work }
        const warmStart = performance.now()
        const warm = (await service.execute(
          { kind: 'read', address, expectedRevision: metadata.revision },
          signal,
        )) as NodeResult
        const warmMs = performance.now() - warmStart
        const warmWork = { ...work }
        expect(warm).toEqual(cold)
        expect(
          byteSize({ type: 'response', id: randomUUID(), result: { ok: true, value: cold } }),
        ).toBeLessThanOrEqual(RAW_LIMITS.responseBytes)
        if (lexeme) {
          const scalar = (await service.execute(
            {
              kind: 'read',
              address: { source, pointer: scalarPointer as JsonPointer },
              expectedRevision: metadata.revision,
            },
            signal,
          )) as NodeResult
          expect(scalar).toMatchObject({ mode: 'complete', value: { kind: 'number', lexeme } })
        }
        if (file.startsWith('TextMap') || file.startsWith('Config')) {
          expect(cold.mode).toBe('summary')
          const page = (await service.execute(
            {
              kind: 'children',
              address,
              expectedRevision: metadata.revision,
              limit: 10,
              cursor: null,
            },
            signal,
          )) as ChildrenResult
          expect(page.items.length).toBe(10)
          expect(page.truncated).toBe(true)
          const chosen = page.items[0].node.address as NodeAddress
          const child = (await service.execute(
            { kind: 'read', address: chosen, expectedRevision: metadata.revision },
            signal,
          )) as NodeResult
          expect(byteSize(child)).toBeLessThan(RAW_LIMITS.responseBytes)
        }
        expect(await fingerprint(resolve(root, file))).toEqual(before)
        measurements.push({
          file,
          sourceBytes: before.size,
          sha256: before.hash,
          mode: cold.mode,
          coldMs,
          warmMs,
          coldWork,
          warmWork,
          responseBytes: byteSize(cold),
          memory: process.memoryUsage(),
        })
      }
      const output = resolve(import.meta.dirname, '../artifacts/raw-real-data.json')
      await mkdir(resolve(output, '..'), { recursive: true })
      await writeFile(
        output,
        JSON.stringify(
          {
            ok: true,
            measuredAt: new Date().toISOString(),
            platform: process.platform,
            arch: process.arch,
            versions: process.versions,
            measurements,
            maxRssKiB: process.resourceUsage().maxRSS,
          },
          null,
          2,
        ),
      )
      console.log('real-data report: ' + output)
    } finally {
      service.dispose()
    }
  }, 120000)
})
