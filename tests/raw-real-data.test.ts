import { describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, opendir, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { RawDataService } from '../src/utility/raw-service'
import { RawSourceCatalog } from '../src/utility/raw-source-catalog'
import { workerCatalogRunner } from '../src/utility/raw-catalog-worker-runner'
import { byteSize, RAW_LIMITS } from '../src/shared/raw'
import type {
  ChildrenResult,
  DirectoryPath,
  DirectoryResult,
  JsonPointer,
  NodeAddress,
  NodeResult,
  LocatorResult,
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
    const git = async (args: string[]) =>
      (
        await promisify(execFile)('git', ['-c', 'safe.directory=' + root, '-C', root, ...args])
      ).stdout.trim()
    const repositoryBefore = {
      head: await git(['rev-parse', 'HEAD']),
      status: await git(['status', '--porcelain']),
    }
    let work = { bytesRead: 0, tokens: 0 }
    let parserCalls = 0
    const catalog = new RawSourceCatalog(
      undefined,
      undefined,
      workerCatalogRunner(new URL('../src/utility/raw-catalog-worker.ts', import.meta.url), [
        '--experimental-transform-types',
        '--import',
        new URL('./helpers/source-catalog-loader.mjs', import.meta.url).href,
      ]),
    )
    const service = new RawDataService((metrics) => {
        work = metrics
        parserCalls++
      }, catalog),
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
    const directories = []
    const memoryBeforeCatalog = process.memoryUsage()
    try {
      const { workspaceId } = (await service.execute({ kind: 'open', root }, signal)) as {
        workspaceId: WorkspaceId
      }
      for (const directory of ['', 'ExcelOutput', 'Config/Level/Mission']) {
        const expected = new Set<string>()
        const handle = await opendir(resolve(root, directory))
        for await (const entry of handle)
          if (entry.isDirectory() || (entry.isFile() && entry.name.endsWith('.json')))
            expected.add(entry.name)
        const started = performance.now(),
          pageBytes: number[] = [],
          discovered = new Set<string>()
        const catalogStatus = catalog.metrics?.status
        let cursor: string | null = null
        let previous: DirectoryResult['items'][number] | null = null
        let sources = 0
        do {
          const page = (await service.execute(
            {
              kind: 'directory',
              workspaceId,
              directory: directory as DirectoryPath,
              limit: 200,
              cursor,
            },
            signal,
          )) as DirectoryResult
          const bytes = byteSize({
            type: 'response',
            id: randomUUID(),
            result: { ok: true, value: page },
          })
          expect(bytes).toBeLessThanOrEqual(RAW_LIMITS.responseBytes)
          pageBytes.push(bytes)
          for (const item of page.items) {
            expect(discovered.has(item.name)).toBe(false)
            if (previous)
              expect(
                previous.kind === item.kind
                  ? previous.name < item.name
                  : previous.kind === 'directory' && item.kind === 'source',
              ).toBe(true)
            previous = item
            discovered.add(item.name)
            if (item.kind === 'source') {
              expect(item.name.endsWith('.json')).toBe(true)
              expect(
                await service.execute({ kind: 'release', source: item.source }, signal),
              ).toEqual({ released: false })
              sources++
            }
          }
          cursor = page.nextCursor
          expect(page.truncated).toBe(cursor !== null)
          if (cursor) expect(page.items.length).toBeGreaterThan(0)
        } while (cursor)
        expect(discovered).toEqual(expected)
        directories.push({
          catalogStatus,
          directory,
          entries: discovered.size,
          sources,
          pages: pageBytes.length,
          pageBytes,
          elapsedMs: performance.now() - started,
          automaticallyRegistered: 0,
        })
      }
      const cancellation = new AbortController()
      const cancelled = service
        .execute(
          {
            kind: 'directory',
            workspaceId,
            directory: 'ExcelOutput' as DirectoryPath,
            limit: 200,
            cursor: null,
          },
          cancellation.signal,
        )
        .catch((error) => error.code)
      setImmediate(() => cancellation.abort())
      expect(await cancelled).toBe('CANCELLED')
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
        expect(await service.execute({ kind: 'release', source }, signal)).toEqual({
          released: true,
        })
        await expect(
          service.execute({ kind: 'read', address, expectedRevision: metadata.revision }, signal),
        ).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
        const reacquired = (await service.execute({ kind: 'info', source }, signal)) as SourceInfo
        expect(reacquired.revision).not.toBe(metadata.revision)
        expect(await service.execute({ kind: 'release', source }, signal)).toEqual({
          released: true,
        })
        measurements.push({
          catalogStatus: catalog.metrics?.status,
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
      const locatorQueries = []
      const locate = async (query: string, signal = new AbortController().signal) =>
        service.execute(
          { kind: 'locate', workspaceId, query, limit: 50, catalogGeneration: null },
          signal,
        ) as Promise<LocatorResult>
      while ((await locate('')).status === 'building')
        await new Promise((resolve) => setTimeout(resolve, 50))
      expect(catalog.metrics?.sources).toBe(137916)
      expect(catalog.metrics?.excludedGit).toBeGreaterThanOrEqual(1)
      const callsBeforeLocator = parserCalls
      for (const query of ['AvatarSkill', 'MonsterSkill', 'TextMapCHS', 'json', 'Config', 'a']) {
        const started = performance.now(),
          result = await locate(query)
        const latencyMs = performance.now() - started
        expect(result.status).toBe('ready')
        expect(result.items.length).toBeLessThanOrEqual(50)
        const payloadBytes = byteSize({
          type: 'response',
          id: randomUUID(),
          result: { ok: true, value: result },
        })
        expect(payloadBytes).toBeLessThanOrEqual(RAW_LIMITS.responseBytes)
        if (['json', 'Config', 'a'].includes(query)) expect(result.truncated).toBe(true)
        else
          expect(
            result.items.some(
              (item) =>
                item.source.relativePath ===
                (query === 'TextMapCHS'
                  ? 'TextMap/TextMapCHS.json'
                  : 'ExcelOutput/' + query + 'Config.json'),
            ),
          ).toBe(true)
        for (const item of result.items)
          expect(await service.execute({ kind: 'release', source: item.source }, signal)).toEqual({
            released: false,
          })
        locatorQueries.push({
          query,
          latencyMs,
          payloadBytes,
          truncated: result.truncated,
          paths: result.items.map((item) => item.source.relativePath),
        })
      }
      expect(parserCalls).toBe(callsBeforeLocator)
      const locatorCancelled = new AbortController(),
        cancellationStarted = performance.now()
      const pending = locate('json', locatorCancelled.signal)
      locatorCancelled.abort()
      await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
      const locator = {
        catalog: catalog.metrics,
        queries: locatorQueries,
        cancelMs: performance.now() - cancellationStarted,
        parserCallsDuringLookup: parserCalls - callsBeforeLocator,
        memoryBeforeCatalog,
        memoryAfterCatalog: process.memoryUsage(),
      }
      const repositoryAfter = {
        head: await git(['rev-parse', 'HEAD']),
        status: await git(['status', '--porcelain']),
      }
      expect(repositoryAfter).toEqual(repositoryBefore)
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
            directories,
            locator,
            repositoryBefore,
            repositoryAfter,
            maxRssKiB: process.resourceUsage().maxRSS,
          },
          null,
          2,
        ),
      )
      console.log('real-data report: ' + output)
    } finally {
      console.log('catalog diagnostics: ' + JSON.stringify(catalog.metrics))
      service.dispose()
    }
  }, 120000)
})
