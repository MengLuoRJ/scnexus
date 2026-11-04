import type {
  ContentType,
  SourceAnalysisChoice,
  Package,
} from '@scnexus/app-shared/types/content.type'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { buildPreview, decodeCcm, parseCcm, parsePackage } from './parser'
import { isContentDiagnostic } from './diagnostics'
import type { ContentSource } from './source'

export type SourceClassification = {
  type: ContentType
  descriptors: { 'package-json'?: string; 'metadata-txt'?: string }
}

export function assertSinglePackageRoot(source: ContentSource) {
  const roots = new Set<string>()
  for (const path of source.descriptorPaths ?? source.entries.map((entry) => entry.path)) {
    const parts = path.split('/')
    if (
      !/^(package\.json|metadata\.txt)$/i.test(parts.at(-1) ?? '') ||
      parts.slice(0, -1).some((part) => /\.sc2(map|mod)$/i.test(part))
    )
      continue
    roots.add(parts.slice(0, -1).join('/').toLowerCase())
  }
  if (roots.size > 1)
    throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
      message:
        'Multiple package roots are not supported: ' +
        [...roots].map((root) => root || '/').join(', '),
    })
}

export async function classifySource(
  source: ContentSource,
  choice?: SourceAnalysisChoice,
): Promise<SourceClassification> {
  if (choice !== undefined && choice !== 'package-json' && choice !== 'metadata-txt')
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  assertSinglePackageRoot(source)
  const descriptors: SourceClassification['descriptors'] = {}
  const packages: Partial<Record<SourceAnalysisChoice, Package>> = {}
  for (const [kind, name] of [
    ['package-json', 'package.json'],
    ['metadata-txt', 'metadata.txt'],
  ] as const) {
    const found: { path: string; pkg: Package; installable: boolean }[] = []
    const paths = source.descriptorPaths ?? source.entries.map((entry) => entry.path)
    for (const path of paths) {
      const parts = path.split('/')
      if (
        parts.at(-1)?.toLowerCase() !== name ||
        parts.slice(0, -1).some((part) => /\.sc2(map|mod)$/i.test(part))
      )
        continue
      const entry = source.entries.find((entry) => entry.path === path)
      if (!entry || entry.bytes > 1024 * 1024)
        throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
          message: 'Invalid descriptor: ' + path,
        })
      const data = await source.read(path)
      const pkg =
        kind === 'metadata-txt'
          ? parseCcm(decodeCcm(data).text)
          : parsePackage(data.toString('utf8'))
      let installable = true
      try {
        buildPreview(source, path, pkg, kind === 'metadata-txt')
      } catch (error) {
        if (!isContentDiagnostic(error)) throw error
        installable = false
      }
      found.push({ path, pkg, installable })
    }
    if (!found.length) continue
    // Preserve the existing outermost valid-plan root rule, without swallowing malformed headers.
    const candidates = found.some((item) => item.installable)
      ? found.filter((item) => item.installable)
      : found
    const depth = Math.min(...candidates.map((item) => item.path.split('/').length))
    const outer = candidates.filter((item) => item.path.split('/').length === depth)
    if (outer.length !== 1)
      throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
        message: 'Multiple outermost packages: ' + outer.map((item) => item.path).join(', '),
      })
    descriptors[kind] = outer[0].path
    packages[kind] = outer[0].pkg
  }
  const conflict =
    packages['package-json'] &&
    packages['metadata-txt'] &&
    packages['package-json'].type !== packages['metadata-txt'].type
  if (choice !== undefined && !conflict) throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  const selected = choice
    ? packages[choice]
    : (packages['package-json'] ?? packages['metadata-txt'])
  if (choice) {
    delete descriptors[choice === 'package-json' ? 'metadata-txt' : 'package-json']
  }
  const type: ContentType = selected
    ? selected.type
    : hasOfficialDirectory(source)
      ? 'campaign'
      : 'customize'
  return { type, descriptors }
}

export function hasOfficialDirectory(source: ContentSource): boolean {
  const directories = new Set(source.directories ?? [])
  for (const entry of source.entries) {
    const parts = entry.path.split('/')
    for (let index = 1; index < parts.length; index++)
      directories.add(parts.slice(0, index).join('/'))
  }
  return [...directories].some((path) => {
    const parts = path.split('/')
    return parts.some(
      (part, index) =>
        /^maps$/i.test(part) &&
        parts[index + 1]?.toLowerCase() === 'campaign' &&
        !parts.slice(0, index).some((part) => /\.sc2(map|mod)$/i.test(part)),
    )
  })
}
