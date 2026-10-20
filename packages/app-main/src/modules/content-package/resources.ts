import { createHash } from 'node:crypto'
import { lstat, readdir } from 'node:fs/promises'
import { hashFile } from './source'
import type { PlannedFile } from '@scnexus/app-shared/types/content.type'
import { resourcePath } from '@scnexus/app-shared/utils/content-files'
import { safePath, keyPath } from './paths'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'

export function resourceGroups<T extends PlannedFile>(files: T[]) {
  const groups = new Map<string, { target: string; files: T[] }>()
  for (const file of files) {
    const target = resourcePath(file.target)
    const key = keyPath(target)
    const group = groups.get(key) ?? { target, files: [] }
    group.files.push(file)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export async function resourceState(path: string) {
  let info
  try {
    info = await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  const digest = createHash('sha256')
  let bytes = 0
  const visit = async (absolute: string, name: string): Promise<void> => {
    const stat = await lstat(absolute)
    if (stat.isSymbolicLink()) throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
    digest.update(JSON.stringify([name, stat.isDirectory() ? 'directory' : 'file']))
    if (stat.isDirectory()) {
      for (const entry of (await readdir(absolute)).sort())
        await visit(
          await safePath(path, name ? name + '/' + entry : entry),
          name ? name + '/' + entry : entry,
        )
    } else if (stat.isFile()) {
      bytes += stat.size
      digest.update(await hashFile(absolute))
    } else throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  }
  await visit(path, '')
  return {
    bytes,
    modifiedAt: info.mtimeMs,
    hash: digest.digest('hex'),
    directory: info.isDirectory(),
  }
}
