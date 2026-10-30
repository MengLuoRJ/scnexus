import { basename } from 'node:path'
import { resourcePath } from '@scnexus/app-shared/utils/content-files'
import type { InstallPreview, Package, PlannedFile } from '@scnexus/app-shared/types/content.type'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { keyPath, packagePath } from './paths'

export function resolveLauncher(pkg: Package, files: PlannedFile[]): InstallPreview['launcher'] {
  if (pkg.type !== 'customize') return { source: 'none', target: null, candidates: [] }
  const candidates: InstallPreview['launcher']['candidates'] = []
  const seen = new Set<string>()
  const detectedTargets = new Set<string>()
  const conventional = /^(?:launcher|启动器|啟動器)\.sc2map$/i
  for (const file of files) {
    if (file.type !== 'map') continue
    const target = resourcePath(file.target)
    if (!/^Maps\/.+\.sc2map$/i.test(target)) continue
    const key = keyPath(target)
    if (
      conventional.test(basename(target)) ||
      conventional.test(basename(resourcePath(file.source)))
    )
      detectedTargets.add(key)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({ name: basename(target), target })
  }
  if (pkg.launcher !== undefined) {
    const maps = (pkg.maps ?? []).filter((map) => map.name === pkg.launcher!.name)
    if (maps.length !== 1)
      throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
        message: 'Ambiguous launcher declaration',
      })
    const target = packagePath(maps[0]!.target_path ?? maps[0]!.source_path)
    const candidate = candidates.find((item) => keyPath(item.target) === keyPath(target))
    if (!candidate)
      throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
        message: 'Launcher resource is missing',
      })
    return { source: 'manifest', target: candidate.target, candidates }
  }
  const detected = candidates.filter((item) => detectedTargets.has(item.target.toLowerCase()))
  return {
    source: detected.length ? 'detected' : 'none',
    target: detected.length === 1 ? detected[0]!.target : null,
    candidates,
  }
}

export function restoreLauncher(
  record: import('@scnexus/app-shared/types/content.type').ContentRecord,
) {
  if (record.package.type !== 'customize') return
  const launcher = resolveLauncher(record.package, record.installedFiles)
  if (
    (!record.launcherCustomized && launcher.source === 'manifest') ||
    !Object.hasOwn(record, 'launcherTarget')
  )
    record.launcherTarget = launcher.target
  else if (
    record.launcherTarget !== null &&
    !launcher.candidates.some((item) => item.target === record.launcherTarget)
  )
    record.launcherTarget = null
}
