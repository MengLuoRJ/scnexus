import { ipcDesktop, ipcRequest, ipcSnapshot } from './internal/ipc-common'
import type { ReplayScope } from '@scnexus/app-shared/types/replay.type'

const replay = () => ipcDesktop().replay
export const ipcReplayWatch = (scope: ReplayScope, id: string) =>
  ipcRequest(() => replay().watch(ipcSnapshot(scope), id))
export const ipcReplayProfiles = () => ipcRequest(() => replay().profiles())
export const ipcReplayChooseExportPath = () => ipcRequest(() => replay().chooseExportPath())
export const ipcReplayAnalyze = (scope: ReplayScope, id: string) =>
  ipcRequest(() => replay().analyze(ipcSnapshot(scope), id))
export const ipcReplayGetAnalysis = (scope: ReplayScope, id: string) =>
  ipcRequest(() => replay().getAnalysis(ipcSnapshot(scope), id))
export const ipcReplayListDuplicates = (scope: ReplayScope) =>
  ipcRequest(() => replay().listDuplicates(ipcSnapshot(scope)))
export const ipcReplayExportArchive = (scope: ReplayScope, ids: string[], destination: string) =>
  ipcRequest(() => replay().exportArchive(ipcSnapshot(scope), [...ids], destination))
export const ipcReplayList = (scope: ReplayScope) =>
  ipcRequest(() => replay().list(ipcSnapshot(scope)))
export const ipcReplayScan = (scope: ReplayScope) =>
  ipcRequest(() => replay().scan(ipcSnapshot(scope)))
export const ipcReplayImportFile = (scope: ReplayScope, path: string) =>
  ipcRequest(() => replay().importFile(ipcSnapshot(scope), path))
export const ipcReplayImportArchive = (scope: ReplayScope, path: string) =>
  ipcRequest(() => replay().importArchive(ipcSnapshot(scope), path))
export const ipcReplayDelete = (scope: ReplayScope, id: string) =>
  ipcRequest(() => replay().delete(ipcSnapshot(scope), id))
