import { ipcApi, useIpcApi } from './ipc-util'

export const apiShellOpenExternalWebsite = (link: string) =>
  useIpcApi<string>('apiShellOpenExternalWebsite', ipcApi['shell:open-external-website'](link))
export const apiShellOpenPath = (path: string) =>
  useIpcApi<string>('apiShellOpenPath', ipcApi['shell:open-path'](path))
export const apiShellShowItemInFolder = (path: string) =>
  useIpcApi<string>('apiShellShowItemInFolder', ipcApi['shell:show-item-in-folder'](path))
