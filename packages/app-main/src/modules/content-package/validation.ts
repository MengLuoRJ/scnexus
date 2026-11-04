import type { ArchiveValidation, SourceInput } from '@scnexus/app-shared/types/content.type'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { openSource } from './source'
import { buildPreview, decodeCcm, parseCcm, parsePackage } from './parser'
import { classifySource, hasOfficialDirectory } from './classification'
import { detectCampaign, detectCustomize } from './auto-detector'
import { isContentDiagnostic } from './diagnostics'

export async function validateArchive(input: SourceInput): Promise<ArchiveValidation> {
  if (!input || input.kind !== 'archive') throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  const source = await openSource(input)
  const read = source.read
  const cache = new Map<string, Buffer>()
  source.read = async (path) => {
    if (!cache.has(path)) cache.set(path, await read(path))
    return cache.get(path)!
  }
  const result: ArchiveValidation = {
    source: input,
    fileCount: source.entries.length,
    bytes: source.tree.bytes,
    descriptors: [],
    automatic: { contentType: 'customize', preview: null, diagnostic: null },
    diagnostic: null,
  }
  for (const entry of source.entries) {
    const parts = entry.path.split('/')
    const name = parts.at(-1)!.toLowerCase()
    if (
      !['package.json', 'metadata.txt'].includes(name) ||
      parts.slice(0, -1).some((part) => /\.sc2(map|mod)$/i.test(part))
    )
      continue
    const descriptor: ArchiveValidation['descriptors'][number] = {
      path: entry.path,
      standard: name === 'package.json' ? 'scnexus' : 'ccm',
      fields: [],
      package: null,
      valid: false,
      fileCount: 0,
      error: null,
    }
    result.descriptors.push(descriptor)
    try {
      if (entry.bytes > 1024 * 1024) throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
      const data = await source.read(entry.path)
      if (descriptor.standard === 'scnexus') {
        const text = data.toString('utf8')
        let value: unknown
        try {
          value = JSON.parse(text)
        } catch (cause) {
          throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {}, { cause })
        }
        if (value && typeof value === 'object' && !Array.isArray(value))
          descriptor.fields = Object.entries(value).map(([name, value]) => ({
            name,
            value: typeof value === 'string' ? value : JSON.stringify(value),
          }))
        descriptor.package = parsePackage(text)
      } else {
        const text = decodeCcm(data).text
        descriptor.fields = text
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .flatMap((line) => {
            const index = line.indexOf('=')
            return index < 0
              ? []
              : [{ name: line.slice(0, index).trim(), value: line.slice(index + 1).trim() }]
          })
        descriptor.package = parseCcm(text)
      }
      const preview = buildPreview(
        source,
        entry.path,
        descriptor.package,
        descriptor.standard === 'ccm',
      )
      descriptor.fileCount = preview.fileCount
      descriptor.valid = true
    } catch (error) {
      if (!isContentDiagnostic(error)) throw error
      descriptor.error = { code: error.code, message: error.message }
    }
  }
  let type = hasOfficialDirectory(source) ? ('campaign' as const) : ('customize' as const)
  try {
    const classification = await classifySource(source)
    result.automatic.contentType = classification.type
  } catch (error) {
    if (
      !isContentDiagnostic(error) &&
      !(error instanceof AppError && error.code === ERRORS.CONTENT_TYPE_CONFLICT.code)
    )
      throw error
    result.diagnostic = { code: error.code, message: error.message }
    result.automatic.contentType = type
  }
  if (result.automatic.contentType !== 'dependency') {
    type = result.automatic.contentType
    const automatic = type === 'campaign' ? detectCampaign(source) : detectCustomize(source)
    result.automatic.preview = automatic.preview
    result.automatic.diagnostic = automatic.diagnostic ?? null
  }
  return result
}
