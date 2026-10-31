import { lstat, realpath, readdir } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep, parse } from 'node:path'
import { app } from 'electron'
import { settingRepository } from '../../stores/setting'
import type { ReplayScope, StarCraftProfile } from '@scnexus/app-shared/types/replay.type'

export function configuredReplayRoot(): string {
  return (
    settingRepository.getKey('starCraftDocumentsDirectory') ||
    join(app.getPath('documents'), 'StarCraft II')
  )
}

export function validateReplayScope(value: unknown): ReplayScope {
  const scope = value as ReplayScope | null
  if (
    !scope ||
    typeof scope !== 'object' ||
    typeof scope.profileHandle !== 'string' ||
    !/^\d+-S2-\d+-\d+$/.test(scope.profileHandle) ||
    !['Multiplayer', 'Campaign', 'Challenge'].includes(scope.category)
  )
    throw new Error('Invalid replay scope')
  return { profileHandle: scope.profileHandle, category: scope.category }
}

export function contained(root: string, path: string): boolean {
  const child = relative(resolve(root), resolve(path))
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

/** Reject links in every existing component, including the configured root's ancestors. */
export async function safeReplayPath(
  root: string,
  path: string,
  allowMissing = false,
): Promise<boolean> {
  root = resolve(root)
  path = resolve(path)
  if (root !== path && !contained(root, path))
    throw new Error('Replay path is outside selected category')
  const volume = parse(path).root
  let cursor = volume
  let missing = false
  for (const part of relative(volume, path).split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    if (missing) continue
    try {
      const info = await lstat(cursor)
      if (info.isSymbolicLink()) throw new Error('Replay path contains a link')
      if (resolve(await realpath(cursor)).toLowerCase() !== resolve(cursor).toLowerCase())
        throw new Error('Replay path resolves outside its directory')
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') missing = true
      else throw error
    }
  }
  return !missing
}

export async function discoverProfiles(root: string): Promise<StarCraftProfile[]> {
  root = resolve(root)
  if (!(await safeReplayPath(root, root, true))) return []
  async function directories(path: string) {
    if (!(await safeReplayPath(root, path, true))) return []
    return (await readdir(path, { withFileTypes: true })).filter(
      (entry) => entry.isDirectory() && !entry.isSymbolicLink(),
    )
  }
  const profiles: StarCraftProfile[] = []
  const accounts = join(root, 'Accounts')
  for (const account of await directories(accounts)) {
    if (!/^\d+$/.test(account.name)) continue
    for (const profile of await directories(join(accounts, account.name))) {
      if (!/^\d+-S2-\d+-\d+$/.test(profile.name)) continue
      const path = join(accounts, account.name, profile.name)
      await safeReplayPath(root, path)
      profiles.push({
        accountId: account.name,
        handle: profile.name,
        path,
        replayPath: join(path, 'Replays'),
      })
    }
  }
  if (new Set(profiles.map((profile) => profile.handle)).size !== profiles.length)
    throw new Error('Ambiguous StarCraft profile handle')
  return profiles.sort((a, b) => a.handle.localeCompare(b.handle))
}

export async function resolveReplayScope(root: string, input: ReplayScope): Promise<string> {
  const scope = validateReplayScope(input)
  const profile = (await discoverProfiles(root)).find(
    (profile) => profile.handle === scope.profileHandle,
  )
  if (!profile) throw new Error('StarCraft profile does not exist')
  const category = join(profile.replayPath, scope.category)
  await safeReplayPath(root, category, true)
  return category
}
