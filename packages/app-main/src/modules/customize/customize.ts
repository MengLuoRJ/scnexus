import { customizeRepository } from '../../stores/customize'
import { writeFile, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { lstat } from 'node:fs/promises'
import { contentService } from '../content-package'
import { validateRecordPaths } from '../content-package/content-package'
import { safeGamePath } from '../content-package/paths'
import { resolveLauncher } from '../content-package/launcher'
import { getGamePaths, withGameLock } from '../scii-game-setting'
import { runGameExecutable } from './client-launcher'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'

export async function launch(localId: string): Promise<void> {
  if (typeof localId !== 'string' || !localId.trim())
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  await withGameLock(async () => {
    const paths = await getGamePaths()
    const record = contentService.list('customize').records.find((item) => item.localId === localId)
    if (!record) throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
    validateRecordPaths(record, paths)
    const launcher = resolveLauncher(record.package, record.installedFiles)
    const target =
      (!record.launcherCustomized && launcher.source === 'manifest') ||
      record.launcherTarget === undefined
        ? launcher.target
        : record.launcherTarget
    if (!target || !launcher.candidates.some((item) => item.target === target))
      throw new AppError(ERRORS.GAME_LAUNCH_FAILED)
    const absolute = await safeGamePath(paths, target)
    const info = await lstat(absolute)
    if (!info.isFile() && !info.isDirectory()) throw new AppError(ERRORS.GAME_LAUNCH_FAILED)
    await runGameExecutable({ run: absolute })
  })
}
export const analyze = (source: import('@scnexus/app-shared/types/content.type').SourceInput) =>
  contentService.analyze('customize', source)
export const install = (
  selection: import('@scnexus/app-shared/types/content.type').InstallSelection,
  onProgress?: (progress: import('@scnexus/app-shared/types/content.type').InstallProgress) => void,
) => contentService.install(selection, 'customize', onProgress)
export const list = () => contentService.list('customize')
export const scan = () => contentService.scan()
export const prepareUninstall = (id: string) =>
  contentService.prepareRemoval(id, 'uninstall', 'customize')
export const uninstall = (
  id: string,
  decisions: import('@scnexus/app-shared/types/content.type').RemovalDecision[],
) => contentService.remove(id, decisions, 'customize')

export async function setLauncher(localId: string, target: string | null) {
  if (typeof localId !== 'string' || (target !== null && typeof target !== 'string'))
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  return withGameLock(async () => {
    const paths = await getGamePaths()
    const store = customizeRepository.getSnapshot()
    const record = store.records.find((item) => item.localId === localId)
    if (!record) throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
    validateRecordPaths(record, paths)
    const candidates = resolveLauncher(record.package, record.installedFiles).candidates
    if (target !== null) {
      if (!candidates.some((item) => item.target === target))
        throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
      const info = await lstat(await safeGamePath(paths, target))
      if (!info.isFile() && !info.isDirectory()) throw new AppError(ERRORS.GAME_LAUNCH_FAILED)
    }
    const next = { ...record, launcherTarget: target, launcherCustomized: true }
    const manifest = await safeGamePath(
      paths,
      record.managementDirectory.slice(paths.gameRoot.length + 1).replaceAll('\\', '/') +
        '/install-manifest.json',
    )
    const staging = join(record.managementDirectory, `.launcher-${randomUUID()}.json`)
    try {
      await writeFile(staging, JSON.stringify(next), { flag: 'wx' })
      await rename(staging, manifest)
      try {
        customizeRepository.update({
          ...store,
          records: store.records.map((item) => (item.localId === localId ? next : item)),
        })
      } catch (error) {
        await writeFile(manifest, JSON.stringify(record))
        throw error
      }
    } finally {
      await rm(staging, { force: true })
    }
    return next
  })
}
