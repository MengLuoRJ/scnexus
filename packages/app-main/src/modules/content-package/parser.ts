import { isPackage } from '@scnexus/standard/package'
import type {
  Package,
  ContentType,
  InstallPreview,
  PlannedFile,
} from '@scnexus/app-shared/types/content.type'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { CAMPAIGNS, packagePath, logicalPath, officialMap, keyPath } from './paths'
import { makeTree, type ContentSource } from './source'
export function parsePackage(text: string, type: ContentType): Package {
  let value: Package
  try {
    value = JSON.parse(text)
  } catch (cause) {
    throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {}, { cause })
  }
  if (!isPackage(value)) throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
  if (value.type !== type) throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED)
  for (const key of ['name', 'description', 'version', 'author'] as const)
    if (typeof value[key] !== 'string' || (key === 'name' && !value[key].trim()))
      throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
  if (type === 'campaign' && !CAMPAIGNS.includes(value.campaign!))
    throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
  for (const category of ['maps', 'mods'] as const) {
    if (value[category] !== undefined && !Array.isArray(value[category]))
      throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
    for (const entry of value[category] ?? []) {
      if (!entry || typeof entry.name !== 'string' || typeof entry.source_path !== 'string')
        throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
      packagePath(entry.source_path)
      if (entry.target_path !== undefined) packagePath(entry.target_path)
    }
  }
  if (value.manager !== undefined && !['SCNexus', 'CCM'].includes(value.manager))
    throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
  if (value.scnid !== undefined && (!Number.isSafeInteger(value.scnid) || value.scnid < 0))
    throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
  if (value.luancher && !(value.maps ?? []).some((map) => map.name === value.luancher!.name))
    throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
      message: 'Launcher is not a declared map',
    })
  return value
}
export function parseCcm(text: string): Package {
  const fields: Record<string, string> = {}
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index >= 0) fields[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  const value: Package = {
    name: fields.title ?? '',
    description: fields.desc ?? '',
    author: fields.author ?? '',
    version: fields.version ?? '',
    type: 'campaign',
    campaign: fields.campaign?.toUpperCase() as Package['campaign'],
    bank_enable: 'offcial',
  }
  return parsePackage(JSON.stringify(value), 'campaign')
}
export function decodeCcm(buffer: Buffer) {
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
      encoding: 'utf-8',
    }
  } catch {
    try {
      return {
        text: new TextDecoder('gb18030', { fatal: true }).decode(buffer),
        encoding: 'gb18030',
      }
    } catch (cause) {
      throw new AppError(
        ERRORS.ARCHIVE_METADATA_INVALID,
        {
          message: 'Metadata text encoding is invalid',
        },
        { cause },
      )
    }
  }
}
export function buildPreview(
  source: ContentSource,
  descriptor: string,
  pkg: Package,
  ccm: boolean,
  rootOverride?: string,
): InstallPreview {
  const root =
    rootOverride ??
    (descriptor.includes('/') ? descriptor.slice(0, descriptor.lastIndexOf('/')) : '')
  const prefix = root ? root + '/' : ''
  const files: PlannedFile[] = []
  const add = (path: string, target: string, type: PlannedFile['type']) => {
    const entry = source.entries.find((e) => e.path === path)!
    target = logicalPath(target)
    if (!/^(Maps|Mods)\//.test(target)) throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
    if (
      pkg.type === 'campaign' &&
      target.startsWith('Maps/Campaign/') &&
      !officialMap(target, pkg.campaign)
    )
      throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED, {
        message: 'Cross-campaign map target',
      })
    const old = files.find((f) => keyPath(f.target) === keyPath(target))
    if (old) {
      if (old.source === path) return
      throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
        message: 'Conflicting package targets',
      })
    }
    files.push({
      source: path,
      target,
      type,
      official: officialMap(target, pkg.campaign),
      bytes: entry.bytes,
      modifiedAt: entry.modifiedAt,
    })
  }
  const resource = (src: string, target: string, type: PlannedFile['type']) => {
    const extension = type === 'map' ? '.sc2map' : '.sc2mod'
    if (!src.toLowerCase().endsWith(extension) || !target.toLowerCase().endsWith(extension))
      throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
    const path = prefix + src
    const matches = source.entries.filter((e) => e.path === path || e.path.startsWith(path + '/'))
    if (!matches.length)
      throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
        message: 'Missing declared resource',
      })
    for (const entry of matches) add(entry.path, target + entry.path.slice(path.length), type)
  }
  if (ccm) {
    for (const entry of source.entries.filter((e) => e.path.startsWith(prefix))) {
      const rel = entry.path.slice(prefix.length)
      const match = rel.match(/^(.*?\.(?:sc2map|sc2mod))(?:\/.*)?$/i)
      if (!match) continue
      const component = match[1]
      const tail = rel.slice(component.length)
      const map = /\.sc2map$/i.test(component)
      if (map) {
        let target: string | undefined
        const roots = {
          WOL: 'Maps/Campaign',
          HOTS: 'Maps/Campaign/swarm',
          LOTV: 'Maps/Campaign/void',
          NCO: 'Maps/Campaign/nova',
        }
        if (!component.includes('/')) target = roots[pkg.campaign!] + '/' + component
        else if (pkg.campaign === 'HOTS' && component.startsWith('evolution/'))
          target = roots.HOTS + '/' + component
        else if (pkg.campaign === 'LOTV' && component.startsWith('voidprologue/'))
          target = 'Maps/Campaign/' + component
        if (target) add(entry.path, target + tail, 'map')
      } else if (!component.includes('/')) add(entry.path, 'Mods/' + rel, 'mod')
      else if (component.startsWith('Mods/')) add(entry.path, rel, 'mod')
    }
  } else {
    if (pkg.type === 'campaign')
      for (const entry of source.entries) {
        if (
          entry.path.startsWith(prefix) &&
          officialMap(entry.path.slice(prefix.length), pkg.campaign)
        )
          add(entry.path, entry.path.slice(prefix.length), 'map')
      }
    for (const [category, type] of [
      ['maps', 'map'],
      ['mods', 'mod'],
    ] as const)
      for (const item of pkg[category] ?? [])
        resource(
          packagePath(item.source_path),
          packagePath(item.target_path ?? item.source_path),
          type,
        )
  }
  if (!files.length || (pkg.type === 'campaign' && !files.some((f) => f.official)))
    throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
      message: 'No installable content',
    })
  return {
    package: pkg,
    rootRelativePath: root,
    descriptorPath: descriptor,
    origin: ccm ? 'metadata-txt' : 'package-json',
    files,
    targetTree: makeTree(
      files.map((f) => ({
        path: f.target,
        bytes: f.bytes,
        modifiedAt: f.modifiedAt,
      })),
      'GameRoot',
    ),
    fileCount: files.length,
    bytes: files.reduce((n, f) => n + f.bytes, 0),
  }
}
