import { useIpcApi } from './ipc-util'

export const ipcShell = {
  openExternalWebsite: (link: string) =>
    useIpcApi<string>('apiShellOpenExternalWebsite', window.apiShellOpenExternalWebsite(link)),
  openPath: (path: string) => useIpcApi<string>('apiShellOpenPath', window.apiShellOpenPath(path)),
  showItemInFolder: (path: string) =>
    useIpcApi<string>('apiShellShowItemInFolder', window.apiShellShowItemInFolder(path)),
}
