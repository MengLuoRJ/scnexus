import { extname, isAbsolute } from 'node:path'
import { app, dialog } from 'electron'
import { discoverReplayDirectories } from './replay-files'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { ipcHandle } from '../../utils/ipc-util'
import { replayLibraryService } from './replay'

function pathArgument(value: unknown, extensions?: string[]): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.includes('\0') ||
    !isAbsolute(value) ||
    (extensions && !extensions.includes(extname(value).toLowerCase()))
  )
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  return value
}

function replayIdArgument(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 100)
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  return value
}

export function initReplayModule() {
  ipcHandle('replay:choose-export-path', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'SCNexus-replays.zip',
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    })
    return result.canceled ? null : (result.filePath ?? null)
  })
  ipcHandle('replay:analyze', (id: unknown) =>
    replayLibraryService.analyzeReplay(replayIdArgument(id)),
  )
  ipcHandle('replay:get-analysis', (id: unknown) =>
    replayLibraryService.getAnalysis(replayIdArgument(id)),
  )
  ipcHandle('replay:discover-directories', () =>
    discoverReplayDirectories(app.getPath('documents')),
  )
  ipcHandle('replay:duplicates', () => replayLibraryService.listDuplicates())
  ipcHandle('replay:export-archive', (ids: unknown, destination: unknown) => {
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 2000 ||
      ids.some((id) => typeof id !== 'string' || !id || id.length > 100) ||
      new Set(ids).size !== ids.length
    )
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
    return replayLibraryService.exportReplayArchive(ids, pathArgument(destination, ['.zip']))
  })
  ipcHandle('replay:list', () => replayLibraryService.listStoredReplays())
  ipcHandle('replay:scan-directory', (rootDir: unknown) =>
    replayLibraryService.scanDirectory(pathArgument(rootDir)),
  )
  ipcHandle('replay:index-file', (filePath: unknown) =>
    replayLibraryService.indexReplayFile(pathArgument(filePath, ['.sc2replay'])),
  )
  ipcHandle('replay:import-archive', (archivePath: unknown, destinationDir: unknown) =>
    replayLibraryService.importReplayArchive(
      pathArgument(archivePath, ['.zip', '.7z', '.rar']),
      pathArgument(destinationDir),
    ),
  )
  ipcHandle('replay:delete', (filePath: unknown) =>
    replayLibraryService.deleteReplay(pathArgument(filePath, ['.sc2replay'])),
  )
}
