import type { BigIntStats } from 'node:fs'
import { lstatSync, realpathSync, statSync } from 'node:fs'
import { lstat, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { RawError } from '../shared/raw'

export const statStamp = (value: BigIntStats): string =>
  [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(':')

export function filesystemError(error: unknown): RawError {
  if (error instanceof RawError) return error
  const code = (error as NodeJS.ErrnoException)?.code
  return new RawError(
    code === 'ENOENT' || code === 'ENOTDIR'
      ? 'NOT_FOUND'
      : code === 'EACCES' || code === 'EPERM' || code === 'ELOOP'
        ? 'ACCESS_DENIED'
        : 'INTERNAL',
  )
}

// canonical root 只由 Utility 持有；check 在每个异步边界复核请求所属代次。
export async function resolveRawPath(
  root: string,
  path: string,
  directory: boolean,
  check: () => void,
): Promise<string> {
  check()
  let candidate = root
  for (const component of path === '' ? [] : path.split('/')) {
    candidate = join(candidate, component)
    const meta = await lstat(candidate)
    check()
    if (meta.isSymbolicLink()) throw new RawError('ACCESS_DENIED')
  }
  const resolved = await realpath(candidate)
  check()
  const contained = relative(root, resolved)
  if (
    (!directory && contained === '') ||
    contained === '..' ||
    contained.startsWith('..' + sep) ||
    isAbsolute(contained)
  )
    throw new RawError('ACCESS_DENIED')
  const meta = await stat(resolved)
  check()
  if (meta.isSymbolicLink()) throw new RawError('ACCESS_DENIED')
  if (directory ? !meta.isDirectory() : !meta.isFile()) throw new RawError('ACCESS_DENIED')
  return resolved
}

/** Same confinement and component-link checks, used only on the catalog worker. */
export function resolveRawDirectorySync(root: string, path: string, check: () => void) {
  check()
  let candidate = root
  for (const component of path === '' ? [] : path.split('/')) {
    candidate = join(candidate, component)
    const meta = lstatSync(candidate)
    check()
    if (meta.isSymbolicLink()) throw new RawError('ACCESS_DENIED')
  }
  const resolved = realpathSync(candidate)
  check()
  const contained = relative(root, resolved)
  if (contained === '..' || contained.startsWith('..' + sep) || isAbsolute(contained))
    throw new RawError('ACCESS_DENIED')
  const meta = statSync(resolved, { bigint: true })
  check()
  if (!meta.isDirectory()) throw new RawError('ACCESS_DENIED')
  return { path: resolved, stamp: statStamp(meta) }
}
