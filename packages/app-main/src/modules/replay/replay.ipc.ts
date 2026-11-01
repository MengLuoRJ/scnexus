import { extname, isAbsolute } from 'node:path'
import { dialog } from 'electron'
import { validateReplayScope } from './replay-scope'
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
  const scopeArgument = (value: unknown) => {
    try {
      return validateReplayScope(value)
    } catch {
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
    }
  }
  ipcHandle('replay:profiles', () => replayLibraryService.profiles())
  ipcHandle('replay:watch', (scope: unknown, id: unknown) =>
    replayLibraryService.watchReplay(scopeArgument(scope), replayIdArgument(id)),
  )
  ipcHandle('replay:analyze', (scope: unknown, id: unknown) =>
    replayLibraryService.analyzeReplay(scopeArgument(scope), replayIdArgument(id)),
  )
  ipcHandle('replay:get-analysis', (scope: unknown, id: unknown) =>
    replayLibraryService.getAnalysis(scopeArgument(scope), replayIdArgument(id)),
  )
  ipcHandle('replay:duplicates', (scope: unknown) =>
    replayLibraryService.listDuplicates(scopeArgument(scope)),
  )
  ipcHandle('replay:export-archive', (scope: unknown, ids: unknown, destination: unknown) => {
    if (!Array.isArray(ids) || !ids.length || ids.length > 2000 || new Set(ids).size !== ids.length)
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
    return replayLibraryService.exportReplayArchive(
      scopeArgument(scope),
      ids.map(replayIdArgument),
      pathArgument(destination, ['.zip']),
    )
  })
  ipcHandle('replay:list', (scope: unknown) =>
    replayLibraryService.listStoredReplays(scopeArgument(scope)),
  )
  ipcHandle('replay:scan', (scope: unknown) => replayLibraryService.scan(scopeArgument(scope)))
  ipcHandle('replay:import-file', (scope: unknown, path: unknown) =>
    replayLibraryService.importFile(scopeArgument(scope), pathArgument(path, ['.sc2replay'])),
  )
  ipcHandle('replay:import-archive', (scope: unknown, path: unknown) =>
    replayLibraryService.importReplayArchive(
      scopeArgument(scope),
      pathArgument(path, ['.zip', '.7z', '.rar']),
    ),
  )
  ipcHandle('replay:delete', (scope: unknown, id: unknown) =>
    replayLibraryService.deleteReplay(scopeArgument(scope), replayIdArgument(id)),
  )
}
