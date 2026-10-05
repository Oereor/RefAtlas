import { lstatSync, opendirSync } from 'node:fs'
import { join } from 'node:path'
import { setImmediate as yieldTurn } from 'node:timers/promises'
import {
  byteSize,
  LOCATOR_LIMITS,
  RAW_LIMITS,
  RawError,
  validDirectoryPath,
  validPath,
} from '../shared/raw'
import type { DirectoryPath, RelativePath } from '../shared/raw'
import { resolveRawDirectorySync } from './raw-filesystem'

export type CatalogEntry = { path: RelativePath; name: string; key: string; base: string }
export type CatalogLimits = { readonly [Key in keyof typeof LOCATOR_LIMITS]: number }
export type CatalogMetrics = {
  bytes: number
  directories: number
  scanned: number
  sources: number
  excludedGit: number
  links: number
  pathTextBytes: number
  timings: { resolveMs: number; readMs: number; metadataMs: number; verificationMs: number }
}
export type CatalogRunner = (
  root: string,
  limits: CatalogLimits,
  signal: AbortSignal,
  emit: (entries: CatalogEntry[], metrics: CatalogMetrics) => void,
) => Promise<CatalogMetrics>

/** Metadata-only engine. Production runs it on one dedicated worker thread. */
export async function scanCatalog(
  root: string,
  limits: CatalogLimits,
  checkCancellation: () => void,
  emit: (entries: CatalogEntry[], metrics: CatalogMetrics) => Promise<void>,
  started = performance.now(),
) {
  const metrics: CatalogMetrics = {
    bytes: 0,
    directories: 0,
    scanned: 0,
    sources: 0,
    excludedGit: 0,
    links: 0,
    pathTextBytes: 0,
    timings: { resolveMs: 0, readMs: 0, metadataMs: 0, verificationMs: 0 },
  }
  const check = () => {
    checkCancellation()
    if (performance.now() - started > limits.buildMs)
      throw new RawError('RESOURCE_LIMIT', { limit: 'CATALOG_BUILD_MS' })
  }
  const charge = (bytes: number) => {
    metrics.bytes += bytes
    if (metrics.bytes > limits.bytes)
      throw new RawError('RESOURCE_LIMIT', { limit: 'CATALOG_BYTES' })
  }
  const timed = <T>(key: keyof CatalogMetrics['timings'], operation: () => T): T => {
    const start = performance.now()
    try {
      return operation()
    } finally {
      metrics.timings[key] += performance.now() - start
    }
  }
  const snapshot = (path: DirectoryPath) =>
    timed('resolveMs', () => resolveRawDirectorySync(root, path, check))
  const stack: DirectoryPath[] = ['' as DirectoryPath]
  const visited: { relative: DirectoryPath; path: string; stamp: string }[] = []
  let scheduled = 1,
    chunk: CatalogEntry[] = []
  // Includes transient directory paths, a bounded packet plus its structured clone and runtime objects.
  charge(1024 * 1024)
  const flush = async () => {
    if (chunk.length) {
      await emit(chunk, metrics)
      chunk = []
      check()
    }
  }
  while (stack.length) {
    check()
    const directory = stack.pop()!,
      before = snapshot(directory)
    metrics.directories++
    charge(160 + 2 * (directory.length + before.path.length + before.stamp.length))
    const handle = opendirSync(before.path, { bufferSize: 64 })
    try {
      check()
      for (;;) {
        const child = timed('readMs', () => handle.readSync())
        check()
        if (!child) break
        if (++metrics.scanned > limits.entries)
          throw new RawError('RESOURCE_LIMIT', { limit: 'CATALOG_ENTRIES' })
        if (child.name.toLowerCase() === '.git') metrics.excludedGit++
        else {
          const meta = timed('metadataMs', () => lstatSync(join(before.path, child.name)))
          check()
          if (meta.isSymbolicLink()) metrics.links++
          else if (meta.isDirectory() || (meta.isFile() && child.name.endsWith('.json'))) {
            const relative = directory ? directory + '/' + child.name : child.name
            if (byteSize(relative) > RAW_LIMITS.addressBytes)
              throw new RawError('RESOURCE_LIMIT', { limit: 'ADDRESS_BYTES' })
            if (meta.isDirectory()) {
              if (!validDirectoryPath(relative)) throw new RawError('ACCESS_DENIED')
              if (++scheduled > limits.directories)
                throw new RawError('RESOURCE_LIMIT', { limit: 'CATALOG_DIRECTORIES' })
              charge(64 + 2 * relative.length)
              stack.push(relative)
            } else {
              if (++metrics.sources > limits.sources)
                throw new RawError('RESOURCE_LIMIT', { limit: 'CATALOG_SOURCES' })
              if (!validPath(relative)) throw new RawError('ACCESS_DENIED')
              const entry = {
                path: relative,
                name: child.name,
                key: relative.toLowerCase(),
                base: child.name.toLowerCase(),
              }
              charge(
                192 +
                  2 *
                    (entry.path.length + entry.name.length + entry.key.length + entry.base.length),
              )
              metrics.pathTextBytes += Buffer.byteLength(relative)
              const packet = (items: CatalogEntry[]) =>
                byteSize({ type: 'entries', entries: items, metrics })
              if (packet([entry]) > RAW_LIMITS.responseBytes)
                throw new RawError('RESOURCE_LIMIT', { limit: 'RESPONSE_BYTES' })
              if (chunk.length === 64 || packet([...chunk, entry]) > RAW_LIMITS.responseBytes)
                await flush()
              chunk.push(entry)
            }
          }
        }
        if (metrics.scanned % limits.yieldEvery === 0) {
          await flush()
          await yieldTurn()
          check()
        }
      }
    } finally {
      handle.closeSync()
    }
    check()
    const after = snapshot(directory)
    if (before.path !== after.path || before.stamp !== after.stamp)
      throw new RawError('SOURCE_CHANGED')
    visited.push({ relative: directory, ...before })
  }
  for (let index = 0; index < visited.length; index++) {
    const before = visited[index]
    const after = timed('verificationMs', () =>
      resolveRawDirectorySync(root, before.relative, check),
    )
    if (before.path !== after.path || before.stamp !== after.stamp)
      throw new RawError('SOURCE_CHANGED')
    if ((index + 1) % limits.yieldEvery === 0) {
      await yieldTurn()
      check()
    }
  }
  await flush()
  check()
  return metrics
}

export const inlineCatalogRunner: CatalogRunner = (root, limits, signal, emit) =>
  scanCatalog(
    root,
    limits,
    () => {
      if (signal.aborted) throw new RawError('CANCELLED')
    },
    async (entries, metrics) => {
      emit(entries, metrics)
    },
  )
