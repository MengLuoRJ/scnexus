import { ipcHandle } from '../../utils/ipc-util'
import { replayLibraryService } from './replay'

export function initReplayModule() {
  ipcHandle('replay:list', () => replayLibraryService.listStoredReplays())
  ipcHandle('replay:scan-directory', (rootDir: string) => replayLibraryService.scanDirectory(rootDir))
  ipcHandle('replay:index-file', (filePath: string) => replayLibraryService.indexReplayFile(filePath))
  ipcHandle('replay:import-archive', (archivePath: string, destinationDir: string) =>
    replayLibraryService.importReplayArchive(archivePath, destinationDir),
  )
  ipcHandle('replay:delete', (filePath: string) => replayLibraryService.deleteReplay(filePath))
}
