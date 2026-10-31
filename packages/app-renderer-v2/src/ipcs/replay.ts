import { ipcDesktop, ipcRequest } from './internal/ipc-common'

const replay = () => ipcDesktop().replay
export const ipcReplayChooseExportPath = () => ipcRequest(() => replay().chooseExportPath())
export const ipcReplayAnalyze = (replayId: string) => ipcRequest(() => replay().analyze(replayId))
export const ipcReplayGetAnalysis = (replayId: string) =>
  ipcRequest(() => replay().getAnalysis(replayId))
export const ipcReplayDiscoverDirectories = () => ipcRequest(() => replay().discoverDirectories())
export const ipcReplayListDuplicates = () => ipcRequest(() => replay().listDuplicates())
export const ipcReplayExportArchive = (ids: string[], destination: string) =>
  ipcRequest(() => replay().exportArchive(ids, destination))
export const ipcReplayList = () => ipcRequest(() => replay().list())
export const ipcReplayScanDirectory = (rootDir: string) =>
  ipcRequest(() => replay().scanDirectory(rootDir))
export const ipcReplayIndexFile = (filePath: string) =>
  ipcRequest(() => replay().indexFile(filePath))
export const ipcReplayImportArchive = (archivePath: string, destinationDir: string) =>
  ipcRequest(() => replay().importArchive(archivePath, destinationDir))
export const ipcReplayDelete = (filePath: string) => ipcRequest(() => replay().delete(filePath))
