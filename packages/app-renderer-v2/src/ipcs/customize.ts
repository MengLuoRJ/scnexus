import { ipcDesktop, ipcRequest, ipcSnapshot, ipcSubscription } from './internal/ipc-common'
import type {
  SourceInput,
  InstallSelection,
  InstallProgress,
  RemovalDecision,
} from '@scnexus/app-shared/types/content.type'

export const ipcCustomizeOnInstallProgress = (listener: (progress: InstallProgress) => void) =>
  ipcSubscription((handler) => ipcDesktop().customize.onInstallProgress(handler), listener)

export const ipcCustomizeCancel = (id: string) =>
  ipcRequest(() => ipcDesktop().customize.cancel(id))
export const ipcCustomizeAnalyze = (input: SourceInput) =>
  ipcRequest(() => ipcDesktop().customize.analyze(ipcSnapshot(input)))
export const ipcCustomizeInstall = (selection: InstallSelection) =>
  ipcRequest(() => ipcDesktop().customize.install(ipcSnapshot(selection)))
export const ipcCustomizeLaunch = (id: string) =>
  ipcRequest(() => ipcDesktop().customize.launch(id))
export const ipcCustomizeList = () => ipcRequest(() => ipcDesktop().customize.list())
export const ipcCustomizeScan = () => ipcRequest(() => ipcDesktop().customize.scan())
export const ipcCustomizePrepareUninstall = (id: string) =>
  ipcRequest(() => ipcDesktop().customize.prepareUninstall(id))
export const ipcCustomizeUninstall = (id: string, decisions: RemovalDecision[]) =>
  ipcRequest(() => ipcDesktop().customize.uninstall(id, ipcSnapshot(decisions)))

export const ipcCustomizeSetLauncher = (id: string, target: string | null) =>
  ipcRequest(() => ipcDesktop().customize.setLauncher(id, target))
