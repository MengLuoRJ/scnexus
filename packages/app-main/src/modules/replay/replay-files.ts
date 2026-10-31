import { createHash } from 'node:crypto'
import { lstat, open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReplayDirectory } from '@scnexus/app-shared/types/replay.type'

export async function hashReplayFile(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const before = await handle.stat()
    if (!before.isFile()) throw new Error('Replay must be a regular file')
    const hash = createHash('sha256')
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk)
    const after = await handle.stat()
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    ) {
      throw new Error('Replay changed while hashing; retry indexing')
    }
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}

/** Enumerates account/profile directories only; never reads or indexes replay files. */
export async function discoverReplayDirectories(
  documentsDirectory: string,
): Promise<ReplayDirectory[]> {
  const accountsRoot = join(documentsDirectory, 'StarCraft II', 'Accounts')
  const result: ReplayDirectory[] = []
  async function directories(path: string) {
    try {
      return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
  for (const account of await directories(accountsRoot)) {
    for (const profile of await directories(join(accountsRoot, account.name))) {
      if (!/^\d+-S2-\d+-\d+$/.test(profile.name)) continue
      const path = join(accountsRoot, account.name, profile.name, 'Replays')
      try {
        const info = await lstat(path)
        if (info.isDirectory() && !info.isSymbolicLink())
          result.push({ path, account: account.name, profile: profile.name })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path))
}
