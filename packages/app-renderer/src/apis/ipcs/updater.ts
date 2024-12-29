import { useIpcApi, useIpcRendererOn } from './ipc-util'

export const ipcUpdater = {
  onCheckingForUpdate: useIpcRendererOn<any>(window.apiUpdaterOnCheckingForUpdate),
  onUpdateAvailable: useIpcRendererOn<any>(window.apiUpdaterOnUpdateAvailable),
  onUpdateNotAvailable: useIpcRendererOn<any>(window.apiUpdaterOnUpdateNotAvailable),
  onDownloadProgress: useIpcRendererOn<any>(window.apiUpdaterOnDownloadProgress),
  onUpdateDownloaded: useIpcRendererOn<any>(window.apiUpdaterOnUpdateDownloaded),
  onError: useIpcRendererOn(window.apiUpdaterOnError),

  checkingForUpdateAndNotify: () =>
    useIpcApi<any | null>("apiUpdaterCheckForUpdatesAndNotify", window.apiUpdaterCheckForUpdatesAndNotify()),
  checkForUpdates: () => useIpcApi<any | null>("apiUpdaterCheckForUpdates", window.apiUpdaterCheckForUpdates()),
  downloadUpdate: () => useIpcApi<string[]>("apiUpdaterDownloadUpdate", window.apiUpdaterDownloadUpdate()),
  quitAndInstall: () => useIpcApi<void>("apiUpdaterQuitAndInstall", window.apiUpdaterQuitAndInstall()),
}
