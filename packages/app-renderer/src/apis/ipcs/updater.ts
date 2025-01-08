import { useIpcApi, useIpcRendererOn } from './ipc-util'

export const apiUpdaterOnCheckingForUpdate = useIpcRendererOn<any>(
  window.apiUpdaterOnCheckingForUpdate,
)
export const apiUpdaterOnUpdateAvailable = useIpcRendererOn<any>(window.apiUpdaterOnUpdateAvailable)
export const apiUpdaterOnUpdateNotAvailable = useIpcRendererOn<any>(
  window.apiUpdaterOnUpdateNotAvailable,
)
export const apiUpdaterOnDownloadProgress = useIpcRendererOn<any>(
  window.apiUpdaterOnDownloadProgress,
)
export const apiUpdaterOnUpdateDownloaded = useIpcRendererOn<any>(
  window.apiUpdaterOnUpdateDownloaded,
)
export const apiUpdaterOnError = useIpcRendererOn(window.apiUpdaterOnError)
export const apiUpdaterCheckForUpdatesAndNotify = () =>
  useIpcApi<any | null>(
    'apiUpdaterCheckForUpdatesAndNotify',
    window.apiUpdaterCheckForUpdatesAndNotify(),
  )
export const apiUpdaterCheckForUpdates = () =>
  useIpcApi<any | null>('apiUpdaterCheckForUpdates', window.apiUpdaterCheckForUpdates())
export const apiUpdaterDownloadUpdate = () =>
  useIpcApi<string[]>('apiUpdaterDownloadUpdate', window.apiUpdaterDownloadUpdate())
export const apiUpdaterQuitAndInstall = () =>
  useIpcApi<void>('apiUpdaterQuitAndInstall', window.apiUpdaterQuitAndInstall())
