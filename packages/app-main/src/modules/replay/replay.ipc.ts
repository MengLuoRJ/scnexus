import { extname, isAbsolute } from 'node:path'
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

export function initReplayModule() {
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
