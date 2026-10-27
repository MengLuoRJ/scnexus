import type { InstallSelection, RemovalDecision } from '@scnexus/app-shared/types/content.type'
import { ipcDesktop, ipcRequest, ipcSnapshot } from './internal/ipc-common'
export const ipcDependencyInstall = (selection: InstallSelection) =>
  ipcRequest(() => ipcDesktop().dependency.install(ipcSnapshot(selection)))
export const ipcDependencyList = () => ipcRequest(() => ipcDesktop().dependency.list())
export const ipcDependencyPrepareUninstall = (id: string) =>
  ipcRequest(() => ipcDesktop().dependency.prepareUninstall(id))
export const ipcDependencyUninstall = (id: string, decisions: RemovalDecision[]) =>
  ipcRequest(() => ipcDesktop().dependency.uninstall(id, ipcSnapshot(decisions)))
