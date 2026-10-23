import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { hashFile } from './source'
import type { PlannedFile } from '@scnexus/app-shared/types/content.type'
import { resourcePath } from '@scnexus/app-shared/utils/content-files'
import { walkReadOnly, keyPath } from './paths'

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
  await walkReadOnly(
    path,
    async (absolute, name, stat) => {
      digest.update(JSON.stringify([name, stat.isDirectory() ? 'directory' : 'file']))
      if (stat.isFile()) {
        bytes += stat.size
        digest.update(await hashFile(absolute))
      }
    },
    info,
  )
  return {
    bytes,
    modifiedAt: info.mtimeMs,
    hash: digest.digest('hex'),
    directory: info.isDirectory(),
  }
}
