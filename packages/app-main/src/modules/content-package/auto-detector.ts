import { basename, extname } from 'node:path'
import type {
  InstallPreview,
  ModeDiagnostic,
  Package,
  PackageCampaignType,
} from '@scnexus/app-shared/types/content.type'
import { buildPreview } from './parser'
import { keyPath } from './paths'
import type { ContentSource } from './source'

export const detectCampaign = (source: ContentSource) => detectContent(source, 'campaign')
export const detectCustomize = (source: ContentSource) => detectContent(source, 'customize')

function detectContent(
  source: ContentSource,
  type: 'campaign' | 'customize',
): {
  preview: InstallPreview | null
  diagnostic?: ModeDiagnostic
} {
  const unavailable = (code: string, message: string) => ({
    preview: null,
    diagnostic: { mode: 'auto' as const, level: 'error' as const, code, message },
  })
  const descriptors =
    source.descriptorPaths ??
    source.entries
      .filter((entry) =>
        entry.path.split('/').some((part) => /^(package\.json|metadata\.txt)$/i.test(part)),
      )
      .map((entry) => entry.path)
  const blocking = descriptors.filter(
    (path) => type === 'campaign' || path.split('/').some((part) => /^package\.json$/i.test(part)),
  )
  if (blocking.length)
    return unavailable(
      'AUTO_DESCRIPTOR_PRESENT',
      `Automatic recognition requires no ${type === 'campaign' ? 'package.json or metadata.txt' : 'package.json'} anywhere in the source, including resource components: ` +
        blocking.join(', '),
    )
  const resources = new Map<
    string,
    { source: string; root: string; target: string; type: 'map' | 'mod'; components: boolean }
  >()
  for (const entry of source.entries) {
    const parts = entry.path.split('/')
    const component = parts.findIndex((part) => /\.sc2(map|mod)$/i.test(part))
    if (component < 0) continue
    const resource = parts.slice(0, component + 1)
    const anchors = resource
      .slice(0, -1)
      .flatMap((part, index) => (/^(Maps|Mods)$/i.test(part) ? [index] : []))
    if (!anchors.length || (type === 'campaign' && anchors.length !== 1))
      return unavailable(
        'AUTO_LAYOUT_AMBIGUOUS',
        'Every resource must belong to one unambiguous standard Maps/Mods root',
      )
    const anchor = anchors[0]
    const resourceType = /\.sc2map$/i.test(resource.at(-1)!) ? 'map' : 'mod'
    if (resource[anchor].toLowerCase() !== (resourceType === 'map' ? 'maps' : 'mods'))
      return unavailable(
        'AUTO_LAYOUT_UNSUPPORTED',
        'Resource is outside its standard Maps/Mods hierarchy: ' + entry.path,
      )
    const relative = resource.slice(anchor)
    relative[0] = resourceType === 'map' ? 'Maps' : 'Mods'
    if (type === 'campaign' && relative[1]?.toLowerCase() === 'campaign') {
      relative[1] = 'Campaign'
      if (/^(swarm|void|voidprologue|nova)$/i.test(relative[2] ?? ''))
        relative[2] = relative[2].toLowerCase()
      if (relative[2] === 'swarm' && relative[3]?.toLowerCase() === 'evolution')
        relative[3] = 'evolution'
    }
    const path = resource.join('/')
    const old = resources.get(keyPath(path))
    if (old && old.source !== path)
      return unavailable('AUTO_LAYOUT_AMBIGUOUS', 'Resource paths differ only in casing')
    resources.set(keyPath(path), {
      source: path,
      root: resource.slice(0, anchor).join('/'),
      target: relative.join('/'),
      type: resourceType,
      components: !!old?.components || component < parts.length - 1,
    })
  }
  const roots = new Set([...resources.values()].map((resource) => resource.root))
  if (roots.size > 1)
    return unavailable(
      'AUTO_LAYOUT_AMBIGUOUS',
      'Multiple logical package roots; Maps and Mods must share exactly one root',
    )
  const campaigns = new Set<PackageCampaignType>()
  for (const resource of resources.values()) {
    if (
      type !== 'campaign' ||
      resource.type !== 'map' ||
      !resource.target.startsWith('Maps/Campaign/')
    )
      continue
    const path = resource.target
    if (/^Maps\/Campaign\/[^/]+\.sc2map$/i.test(path)) campaigns.add('WOL')
    else if (/^Maps\/Campaign\/swarm\/(?:evolution\/)?[^/]+\.sc2map$/i.test(path))
      campaigns.add('HOTS')
    else if (/^Maps\/Campaign\/(void|voidprologue)\/[^/]+\.sc2map$/i.test(path))
      campaigns.add('LOTV')
    else if (/^Maps\/Campaign\/nova\/[^/]+\.sc2map$/i.test(path)) campaigns.add('NCO')
    else return unavailable('AUTO_LAYOUT_UNSUPPORTED', 'Nonstandard campaign map path: ' + path)
  }
  if (campaigns.size > 1)
    return unavailable(
      'AUTO_CAMPAIGN_AMBIGUOUS',
      'Multiple campaign types found: ' + [...campaigns].join(', '),
    )
  if (type === 'campaign' && campaigns.size !== 1)
    return unavailable('AUTO_CAMPAIGN_NOT_FOUND', 'No unique standard campaign map layout found')
  if (!resources.size)
    return unavailable('AUTO_LAYOUT_UNSUPPORTED', 'No standard Maps/Mods resources found')
  const targets = new Set<string>()
  for (const resource of resources.values()) {
    const target = keyPath(resource.target)
    if (targets.has(target))
      return unavailable('AUTO_LAYOUT_AMBIGUOUS', 'Resources resolve to the same canonical target')
    targets.add(target)
  }
  const root = [...roots][0]
  const inputName = basename(source.input.path)
  const pkg: Package = {
    name: root
      ? root.split('/').at(-1)!
      : source.input.kind === 'archive'
        ? inputName.slice(0, -extname(inputName).length || undefined)
        : inputName,
    description: '',
    author: '',
    version: '',
    type,
    ...(type === 'campaign' ? { campaign: [...campaigns][0] } : {}),
  }
  const declarations = (type: 'map' | 'mod') =>
    [...resources.values()]
      .filter((resource) => resource.type === type)
      .map((resource) => ({
        name: basename(resource.target),
        source_path: '/' + resource.target,
        target_path: '/' + resource.target,
        components: resource.components,
      }))
  pkg.maps = declarations('map')
  pkg.mods = declarations('mod')
  const normalized = source.entries.flatMap((entry) => {
    const resource = [...resources.values()].find(
      (item) => entry.path === item.source || entry.path.startsWith(item.source + '/'),
    )
    return resource
      ? [
          {
            ...entry,
            path:
              (root ? root + '/' : '') + resource.target + entry.path.slice(resource.source.length),
            original: entry.path,
          },
        ]
      : []
  })
  const preview = buildPreview({ ...source, entries: normalized }, '', pkg, false, root)
  preview.files = preview.files.map((file) => ({
    ...file,
    source: normalized.find((entry) => entry.path === file.source)!.original,
  }))
  preview.origin = 'auto-detected'
  return { preview }
}
