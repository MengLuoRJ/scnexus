import { useIpcRendererInvoke, useIpcRendererOn } from "./ipc-util";

const moduleChannel = "updater";

export const ipcUpdater = {
  onCheckingForUpdate: useIpcRendererOn<any>(
    `${moduleChannel}:checking-for-update`
  ),
  onUpdateAvailable: useIpcRendererOn<any>(`${moduleChannel}:update-available`),
  onUpdateNotAvailable: useIpcRendererOn<any>(
    `${moduleChannel}:update-not-available`
  ),
  onDownloadProgress: useIpcRendererOn<any>(
    `${moduleChannel}:download-progress`
  ),
  onUpdateDownloaded: useIpcRendererOn<any>(
    `${moduleChannel}:update-downloaded`
  ),
  onError: useIpcRendererOn(`${moduleChannel}:error`),

  checkingForUpdateAndNotify: () =>
    useIpcRendererInvoke<any | null>(
      `${moduleChannel}:checking-for-update-and-notify`
    ),
  checkForUpdates: () =>
    useIpcRendererInvoke<any | null>(`${moduleChannel}:check-for-updates`),
  downloadUpdate: () =>
    useIpcRendererInvoke<string[]>(`${moduleChannel}:download-update`),
  quitAndInstall: () =>
    useIpcRendererInvoke<void>(`${moduleChannel}:quit-and-install`),
};
