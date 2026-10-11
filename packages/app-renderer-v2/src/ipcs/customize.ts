import { desktop, request, ipcSnapshot, subscription } from './internal/ipc-common'
import type {
  SourceInput,
  InstallSelection,
  InstallProgress,
  RemovalDecision,
} from '@scnexus/app-shared/types/content.type'

export const apiCustomizeOnInstallProgress = (listener: (progress: InstallProgress) => void) =>
  subscription((handler) => desktop().customize.onInstallProgress(handler), listener)

export const apiCustomizeCancel = (id: string) => request(() => desktop().customize.cancel(id))
export const apiCustomizeAnalyze = (input: SourceInput) =>
  request(() => desktop().customize.analyze(ipcSnapshot(input)))
export const apiCustomizeInstall = (selection: InstallSelection) =>
  request(() => desktop().customize.install(ipcSnapshot(selection)))
export const apiCustomizeList = () => request(() => desktop().customize.list())
export const apiCustomizeScan = () => request(() => desktop().customize.scan())
export const apiCustomizePrepareUninstall = (id: string) =>
  request(() => desktop().customize.prepareUninstall(id))
export const apiCustomizeUninstall = (id: string, decisions: RemovalDecision[]) =>
  request(() => desktop().customize.uninstall(id, ipcSnapshot(decisions)))
