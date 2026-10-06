import { expect } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { byteSize, RAW_LIMITS } from '../../src/shared/raw'
import type {
  FindResult,
  JsonPointer,
  NodeResult,
  RelativePath,
  SourceInfo,
  WorkspaceId,
} from '../../src/shared/raw'
import type { RawDataService } from '../../src/utility/raw-service'
async function fingerprint(path: string) {
  const meta = await stat(path),
    hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return { hash: hash.digest('hex'), size: meta.size, mtimeMs: meta.mtimeMs }
}
export async function findRealData(
  service: RawDataService,
  workspaceId: WorkspaceId,
  getWork: () => { bytesRead: number; tokens: number },
) {
  const root = resolve(import.meta.dirname, '../../../TurnBasedGameData')
  const samples: [string, [string, boolean][]][] = [
    [
      'ExcelOutput/AvatarConfig.json',
      [
        ['AvatarID', true],
        ['1001', true],
        ['Avatar', false],
        ['__RefAtlas_missing_20261006__', true],
        ['1', false],
      ],
    ],
    [
      'ExcelOutput/AvatarSkillConfig.json',
      [
        ['SkillID', false],
        ['1407', true],
        ['140701', true],
        ['Skill', false],
        ['__RefAtlas_missing_20261006__', true],
        ['1', false],
      ],
    ],
    [
      'ExcelOutput/MonsterConfig.json',
      [
        ['MonsterID', false],
        ['Monster', false],
        ['__RefAtlas_missing_20261006__', true],
        ['1', false],
      ],
    ],
    [
      'TextMap/TextMapCHS.json',
      [
        ['攻击', false],
        ['7505878640962067595', true],
        ['__RefAtlas_missing_20261006__', true],
        ['1', false],
      ],
    ],
    [
      'Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json',
      [
        ['GroupList', true],
        ['__RefAtlas_missing_20261006__', true],
        ['1', false],
      ],
    ],
  ]
  const results = []
  const signal = new AbortController().signal
  for (const [file, queries] of samples) {
    const before = await fingerprint(resolve(root, file)),
      source = { workspaceId, relativePath: file as RelativePath }
    const info = (await service.execute({ kind: 'info', source }, signal)) as SourceInfo
    await service.execute(
      {
        kind: 'read',
        address: { source, pointer: '' as JsonPointer },
        expectedRevision: info.revision,
      },
      signal,
    )
    const measurements = []
    for (const [query, completeScope] of queries) {
      const started = performance.now()
      let cursor: string | null = null,
        firstMs: number | null = null,
        firstProgressMs: number | null = null,
        totalMatches = 0,
        bytes = 0,
        tokens = 0,
        pages = 0,
        maxEnvelope = 0,
        complete = false,
        firstPointer: string | null = null,
        lastProgress = 0
      do {
        const response = (await service.execute(
          { kind: 'find', source, expectedRevision: info.revision, query, limit: 32, cursor },
          signal,
        )) as FindResult
        if (firstProgressMs === null) firstProgressMs = performance.now() - started
        if (response.matches.length && firstMs === null) {
          firstMs = performance.now() - started
          firstPointer = response.matches[0].address.pointer
        }
        const work = getWork()
        bytes += work.bytesRead
        tokens += work.tokens
        pages++
        totalMatches += response.matches.length
        const envelope = byteSize({
          type: 'response',
          id: randomUUID(),
          result: { ok: true, value: response },
        })
        maxEnvelope = Math.max(envelope, maxEnvelope)
        expect(envelope).toBeLessThanOrEqual(RAW_LIMITS.responseBytes)
        expect(response.matches.length).toBeLessThanOrEqual(32)
        expect(response.scannedBytes).toBeGreaterThanOrEqual(lastProgress)
        lastProgress = response.scannedBytes
        cursor = response.nextCursor
        complete = response.complete
      } while (cursor && (completeScope || totalMatches === 0))
      if (query.startsWith('__RefAtlas_missing')) {
        expect(complete).toBe(true)
        expect(totalMatches).toBe(0)
      } else expect(totalMatches).toBeGreaterThan(0)
      const finished = performance.now() - started
      if (cursor)
        await service.execute(
          { kind: 'find-close', source, expectedRevision: info.revision, cursor },
          signal,
        )
      let navigationMs: number | null = null
      if (firstPointer !== null) {
        const start = performance.now()
        const node = (await service.execute(
          {
            kind: 'read',
            address: { source, pointer: firstPointer as JsonPointer },
            expectedRevision: info.revision,
          },
          signal,
        )) as NodeResult
        navigationMs = performance.now() - start
        expect(node.node.address.pointer).toBe(firstPointer)
        if (file.includes('AvatarSkill') && query === '1407')
          expect(
            node.mode === 'complete' &&
              node.value.kind === 'number' &&
              node.value.lexeme.includes('1407'),
          ).toBe(true)
      }
      measurements.push({
        query,
        firstBoundedReplyMs: firstProgressMs,
        timeToFirstMatchMs: firstMs,
        elapsedMs: finished,
        complete,
        matchesReturned: totalMatches,
        pages,
        morePossible: !!cursor,
        bytesRead: bytes,
        tokens,
        maxEnvelopeBytes: maxEnvelope,
        firstPointer,
        navigationMs,
        memory: process.memoryUsage(),
      })
    }
    let cancellation: unknown = null
    if (file.includes('TextMap') || file.includes('Baked')) {
      const control = new AbortController()
      let aborted = 0
      const pending = service.execute(
        {
          kind: 'find',
          source,
          expectedRevision: info.revision,
          query: '__late_cancel__',
          limit: 32,
          cursor: null,
        },
        control.signal,
      )
      const timer = setTimeout(() => {
        aborted = performance.now()
        control.abort()
      }, 25)
      await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
      const cancelLatencyMs = performance.now() - aborted
      clearTimeout(timer)
      const scan = service.execute(
        {
          kind: 'find',
          source,
          expectedRevision: info.revision,
          query: '__queued_navigation__',
          limit: 32,
          cursor: null,
        },
        signal,
      ) as Promise<FindResult>
      const navigationStarted = performance.now()
      await service.execute(
        {
          kind: 'read',
          address: { source, pointer: '' as JsonPointer },
          expectedRevision: info.revision,
        },
        signal,
      )
      const navigationDuringFindMs = performance.now() - navigationStarted,
        progress = await scan
      if (progress.nextCursor)
        await service.execute(
          {
            kind: 'find-close',
            source,
            expectedRevision: info.revision,
            cursor: progress.nextCursor,
          },
          signal,
        )
      cancellation = { cancelLatencyMs, navigationDuringFindMs, work: getWork() }
    }
    expect(await fingerprint(resolve(root, file))).toEqual(before)
    results.push({ file, sizeBytes: before.size, fingerprint: before, measurements, cancellation })
    await service.execute({ kind: 'release', source }, signal)
  }
  return results
}
