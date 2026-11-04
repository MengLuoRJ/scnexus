import type {
  ContentType,
  AnalysisResult,
  InstallPreview,
} from '@scnexus/app-shared/types/content.type'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'
import { AppError } from '@scnexus/app-shared/errors/app.error'
import { buildPreview, parsePackage, parseCcm, decodeCcm } from './parser'
import { detectCampaign, detectCustomize } from './auto-detector'
import { isContentDiagnostic } from './diagnostics'
import type { ContentSource } from './source'
import type { SourceClassification } from './classification'

export async function analyzeSourceModes(
  source: ContentSource,
  type: ContentType,
  classification?: SourceClassification,
) {
  const result: Pick<AnalysisResult, 'modes' | 'diagnostics'> = {
    modes: { scnexus: null, ccm: null, auto: null },
    diagnostics: [],
  }
  const discover = async (name: string, ccm: boolean) => {
    const found: InstallPreview[] = []
    for (const entry of source.entries
      .filter((e) =>
        classification
          ? e.path === classification.descriptors[ccm ? 'metadata-txt' : 'package-json']
          : e.path.split('/').at(-1)?.toLowerCase() === name,
      )
      .filter(
        (e) =>
          !e.path
            .split('/')
            .slice(0, -1)
            .some((p) => /\.sc2(map|mod)$/i.test(p)),
      )) {
      try {
        if (entry.bytes > 1024 * 1024) throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
        const data = await source.read(entry.path)
        const pkg = ccm ? parseCcm(decodeCcm(data).text) : parsePackage(data.toString('utf8'), type)
        found.push(buildPreview(source, entry.path, pkg, ccm))
      } catch (error) {
        if (!isContentDiagnostic(error)) throw error
        result.diagnostics.push({
          mode: ccm ? 'ccm' : 'scnexus',
          level: 'error',
          code: error.code,
          message: `Invalid descriptor: ${entry.path}`,
        })
      }
    }
    if (!found.length) return null
    const depth = Math.min(...found.map((p) => p.descriptorPath.split('/').length))
    const outer = found.filter((p) => p.descriptorPath.split('/').length === depth)
    if (outer.length > 1) {
      result.diagnostics.push({
        mode: ccm ? 'ccm' : 'scnexus',
        level: 'error',
        code: ERRORS.ARCHIVE_METADATA_INVALID.code,
        message: 'Multiple outermost packages: ' + outer.map((p) => p.descriptorPath).join(', '),
      })
      return null
    }
    return outer[0]
  }
  result.modes.scnexus = await discover('package.json', false)
  if (type === 'campaign') result.modes.ccm = await discover('metadata.txt', true)
  if (!result.modes.scnexus && result.modes.ccm) {
    result.modes.scnexus = {
      ...structuredClone(result.modes.ccm),
      origin: 'ccm-converted',
    }
  }
  const automatic =
    type === 'dependency'
      ? { preview: null, diagnostic: undefined }
      : (type === 'campaign' ? detectCampaign : detectCustomize)(source)
  result.modes.auto = automatic.preview
  if (automatic.diagnostic) result.diagnostics.push(automatic.diagnostic)
  return result
}
