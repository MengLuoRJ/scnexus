import { relative, resolve, isAbsolute, sep, posix } from 'node:path'
import { lstat, realpath, readdir } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import type { PackageCampaignType } from '@scnexus/app-shared/types/content.type'
export const CAMPAIGNS = ['WOL', 'HOTS', 'LOTV', 'NCO'] as const
export const campaignRoots: Record<PackageCampaignType, string[]> = {
  WOL: ['Maps/Campaign'],
  HOTS: ['Maps/Campaign/swarm', 'Maps/Campaign/swarm/evolution'],
  LOTV: ['Maps/Campaign/void', 'Maps/Campaign/voidprologue'],
  NCO: ['Maps/Campaign/nova'],
}
export function logicalPath(input: string): string {
  if (
    typeof input !== 'string' ||
    [...input].some((character) => character.charCodeAt(0) < 32) ||
    input.includes(':') ||
    input.startsWith('\\') ||
    input.startsWith('//')
  )
    throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  const value = input.replaceAll('\\', '/').replace(/^\//, '').replace(/\/$/, '')
  if (!value || value.split('/').some((s) => !s || s === '.' || s === '..'))
    throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  return value
}
export function packagePath(input: string) {
  if (typeof input !== 'string' || !/^\/(Maps|Mods)\//.test(input))
    throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
  return logicalPath(input)
}
export function below(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path))
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)
}
export async function safePath(root: string, logical: string): Promise<string> {
  const path = resolve(root, logicalPath(logical))
  if (!below(root, path)) throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  let current = resolve(root)
  const resolvedRoot = await realpath(current)
  for (const part of relative(current, path).split(sep)) {
    current = resolve(current, part)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink() || !below(resolvedRoot, await realpath(current)))
        throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return path
}
// Read-only traversal validates each node once, after its parent; never reuse this for writes.
export async function walkReadOnly(
  root: string,
  visit: (absolute: string, path: string, info: Stats) => void | Promise<void>,
  rootInfo?: Stats,
): Promise<void> {
  const resolvedRoot = await realpath(root)
  const walk = async (absolute: string, path: string, info?: Stats): Promise<void> => {
    const stat = info ?? (await lstat(absolute))
    if (
      stat.isSymbolicLink() ||
      (!stat.isDirectory() && !stat.isFile()) ||
      !below(resolvedRoot, await realpath(absolute))
    )
      throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
    await visit(absolute, path, stat)
    if (stat.isDirectory())
      for (const name of (await readdir(absolute)).sort()) {
        const child = logicalPath(path ? path + '/' + name : name)
        const childAbsolute = resolve(root, child)
        if (!below(root, childAbsolute)) throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
        await walk(childAbsolute, child)
      }
  }
  await walk(resolve(root), '', rootInfo)
}
export function officialMap(target: string, campaign?: PackageCampaignType): boolean {
  if (!/\.sc2map(?:\/|$)/i.test(target)) return false
  if (!campaign) return CAMPAIGNS.some((type) => officialMap(target, type))
  const path = target.toLowerCase()
  if (campaign === 'WOL')
    return (
      path.startsWith('maps/campaign/') &&
      !/^(maps\/campaign\/(swarm|void|voidprologue|nova))\//.test(path)
    )
  return campaignRoots[campaign].some((root) => path.startsWith(root.toLowerCase() + '/'))
}
export const keyPath = (value: string) => posix.normalize(value.replaceAll('\\', '/')).toLowerCase()
