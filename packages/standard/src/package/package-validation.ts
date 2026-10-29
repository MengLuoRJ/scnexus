import type { Package, PackageCampaign, PackageCustomize, PackageDependency } from './package.type'
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function text(value: unknown) {
  return typeof value === 'string' && !value.includes('\0')
}
export function isPackage(value: unknown): value is Package {
  if (!object(value) || !['campaign', 'customize', 'dependency'].includes(value.type as string))
    return false
  if (value.type === 'dependency') {
    const allowed = new Set([
      '$schema',
      'scnid',
      'name',
      'description',
      'tags',
      'version',
      'author',
      'type',
      'mods',
      'website',
      'readme',
      'changelog',
      'docs',
      'assets',
      'social',
      'sponsor',
    ])
    if (Object.keys(value).some((key) => !allowed.has(key))) return false
  }
  if (!['name', 'description', 'version', 'author'].every((key) => text(value[key]))) return false
  if (!(value.name as string).trim()) return false
  if (
    value.type === 'campaign' &&
    !['WOL', 'HOTS', 'LOTV', 'NCO'].includes(value.campaign as string)
  )
    return false
  if (
    value.scnid !== undefined &&
    (!Number.isSafeInteger(value.scnid) || (value.scnid as number) < 0)
  )
    return false
  if (value.manager !== undefined && !['SCNexus', 'CCM'].includes(value.manager as string))
    return false
  if (
    value.bank_enable !== undefined &&
    !['official', 'custom'].includes(value.bank_enable as string)
  )
    return false
  if (value.tags !== undefined && (!Array.isArray(value.tags) || !value.tags.every(text)))
    return false
  for (const category of ['maps', 'mods'] as const) {
    const entries = value[category]
    if (entries === undefined) continue
    if (!Array.isArray(entries)) return false
    const prefix = category === 'maps' ? '/Maps/' : '/Mods/'
    const ext = category === 'maps' ? '.sc2map' : '.sc2mod'
    for (const item of entries) {
      if (
        !object(item) ||
        !text(item.name) ||
        !(item.name as string).toLowerCase().endsWith(ext) ||
        !text(item.source_path) ||
        !(item.source_path as string).startsWith(prefix)
      )
        return false
      if (
        item.target_path !== undefined &&
        (!text(item.target_path) || !(item.target_path as string).startsWith(prefix))
      )
        return false
      for (const k of ['description', 'version'])
        if (item[k] !== undefined && !text(item[k])) return false
      if (item.components !== undefined && typeof item.components !== 'boolean') return false
    }
  }
  if (
    value.dependencies !== undefined &&
    (!Array.isArray(value.dependencies) ||
      !value.dependencies.every(
        (item) =>
          object(item) &&
          (item.scnid === undefined ||
            (Number.isSafeInteger(item.scnid) && (item.scnid as number) >= 0)) &&
          (item.version === undefined || text(item.version)),
      ))
  )
    return false
  if (
    value.launcher !== undefined &&
    (!object(value.launcher) ||
      !text(value.launcher.name) ||
      (value.launcher.description !== undefined && !text(value.launcher.description)))
  )
    return false
  if (
    value.localization !== undefined &&
    (!Array.isArray(value.localization) ||
      !value.localization.every(
        (item) =>
          object(item) &&
          text(item.locale) &&
          ['name', 'description', 'author', 'version'].every(
            (key) => item[key] === undefined || text(item[key]),
          ) &&
          (item.translators === undefined ||
            (Array.isArray(item.translators) && item.translators.every(text))),
      ))
  )
    return false
  if (
    value.banks !== undefined &&
    (!Array.isArray(value.banks) ||
      !value.banks.every(
        (item) =>
          object(item) &&
          text(item.name) &&
          (item.description === undefined || text(item.description)),
      ))
  )
    return false
  if (
    'banner' in value &&
    (value.type !== 'campaign' || (value.banner !== undefined && !text(value.banner)))
  )
    return false
  if (
    'cover' in value &&
    (value.type !== 'customize' || (value.cover !== undefined && !text(value.cover)))
  )
    return false
  for (const key of ['readme', 'changelog'])
    if (value[key] !== undefined && !text(value[key])) return false
  for (const key of ['docs', 'assets'])
    if (value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every(text)))
      return false
  if (value.$schema !== undefined && !text(value.$schema)) return false
  if (value.website !== undefined && !text(value.website)) return false
  for (const category of ['social', 'sponsor'])
    if (
      value[category] !== undefined &&
      (!object(value[category]) || !Object.values(value[category] as object).every(text))
    )
      return false
  return true
}

export function isPackageCampaign(value: unknown): value is PackageCampaign {
  return isPackage(value) && value.type === 'campaign'
}
export function isPackageCustomize(value: unknown): value is PackageCustomize {
  return isPackage(value) && value.type === 'customize'
}
export function isPackageDependency(value: unknown): value is PackageDependency {
  return isPackage(value) && value.type === 'dependency'
}
