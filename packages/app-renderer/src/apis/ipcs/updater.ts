import { ProgressInfo, UpdateCheckResult, UpdateInfo } from "electron-updater";
import { useIpcRendererInvoke, useIpcRendererOn } from "./ipc-util";

const moduleChannel = "updater";

export const ipcUpdater = {
  onCheckingForUpdate: useIpcRendererOn<UpdateInfo>(
    `${moduleChannel}:checking-for-update`
  ),
  onUpdateAvailable: useIpcRendererOn<UpdateInfo>(
    `${moduleChannel}:update-available`
  ),
  onUpdateNotAvailable: useIpcRendererOn<UpdateInfo>(
    `${moduleChannel}:update-not-available`
  ),
  onDownloadProgress: useIpcRendererOn<ProgressInfo>(
    `${moduleChannel}:download-progress`
  ),
  onUpdateDownloaded: useIpcRendererOn<UpdateInfo>(
    `${moduleChannel}:update-downloaded`
  ),
  onError: useIpcRendererOn(`${moduleChannel}:error`),

  checkingForUpdateAndNotify: () =>
    useIpcRendererInvoke<UpdateCheckResult | null>(
      `${moduleChannel}:checking-for-update-and-notify`
    ),
  checkForUpdates: () =>
    useIpcRendererInvoke<UpdateCheckResult | null>(
      `${moduleChannel}:check-for-updates`
    ),
  downloadUpdate: () =>
    useIpcRendererInvoke<string[]>(`${moduleChannel}:download-update`),
  quitAndInstall: () =>
    useIpcRendererInvoke<void>(`${moduleChannel}:quit-and-install`),
};
