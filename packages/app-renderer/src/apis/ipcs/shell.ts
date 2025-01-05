import { useIpcApi } from './ipc-util'

export const apiShellOpenExternalWebsite = (link: string) =>
  useIpcApi<string>('apiShellOpenExternalWebsite', window.apiShellOpenExternalWebsite(link))
export const apiShellOpenPath = (path: string) =>
  useIpcApi<string>('apiShellOpenPath', window.apiShellOpenPath(path))
export const apiShellShowItemInFolder = (path: string) =>
  useIpcApi<string>('apiShellShowItemInFolder', window.apiShellShowItemInFolder(path))
