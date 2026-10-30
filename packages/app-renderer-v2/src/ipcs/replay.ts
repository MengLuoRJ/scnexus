import { ipcDesktop, ipcRequest } from './internal/ipc-common'

const replay = () => ipcDesktop().replay
export const ipcReplayList = () => ipcRequest(() => replay().list())
export const ipcReplayScanDirectory = (rootDir: string) =>
  ipcRequest(() => replay().scanDirectory(rootDir))
export const ipcReplayIndexFile = (filePath: string) =>
  ipcRequest(() => replay().indexFile(filePath))
export const ipcReplayImportArchive = (archivePath: string, destinationDir: string) =>
  ipcRequest(() => replay().importArchive(archivePath, destinationDir))
export const ipcReplayDelete = (filePath: string) => ipcRequest(() => replay().delete(filePath))
