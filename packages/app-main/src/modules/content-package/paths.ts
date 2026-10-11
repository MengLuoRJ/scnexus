import { relative, resolve, isAbsolute, sep, posix } from 'node:path'
import { lstat, realpath } from 'node:fs/promises'
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
