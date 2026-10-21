import { ipcBridgeRequest } from './internal/bridge'
export const ipcShellOpenExternalWebsite = (url: string) =>
  ipcBridgeRequest<void>('shell:open-external-website', url)
export const ipcShellOpenPath = (path: string) =>
  ipcBridgeRequest<string | undefined>('shell:open-path', path)
export const ipcShellShowItemInFolder = (path: string) =>
  ipcBridgeRequest<void>('shell:show-item-in-folder', path)
