import { ipcApi, useIpcApi, useIpcRendererOn } from './ipc-util'

export const apiUpdaterOnCheckingForUpdate = useIpcRendererOn<any>(
  ipcApi['updater:checking-for-update'],
)
export const apiUpdaterOnUpdateAvailable = useIpcRendererOn<any>(ipcApi['updater:update-available'])
export const apiUpdaterOnUpdateNotAvailable = useIpcRendererOn<any>(
  ipcApi['updater:update-not-available'],
)
export const apiUpdaterOnDownloadProgress = useIpcRendererOn<any>(
  ipcApi['updater:download-progress'],
)
export const apiUpdaterOnUpdateDownloaded = useIpcRendererOn<any>(
  ipcApi['updater:update-downloaded'],
)
export const apiUpdaterOnError = useIpcRendererOn(ipcApi['updater:error'])
export const apiUpdaterCheckForUpdatesAndNotify = () =>
  useIpcApi<any | null>(
    'apiUpdaterCheckForUpdatesAndNotify',
    ipcApi['updater:check-for-updates-and-notify'](),
  )
export const apiUpdaterCheckForUpdates = () =>
  useIpcApi<any | null>('apiUpdaterCheckForUpdates', ipcApi['updater:check-for-updates']())
export const apiUpdaterDownloadUpdate = () =>
  useIpcApi<string[]>('apiUpdaterDownloadUpdate', ipcApi['updater:download-update']())
export const apiUpdaterQuitAndInstall = () =>
  useIpcApi<void>('apiUpdaterQuitAndInstall', ipcApi['updater:quit-and-install']())
