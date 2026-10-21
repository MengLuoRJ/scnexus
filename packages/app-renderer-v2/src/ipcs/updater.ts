import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import { ipcBridgeRequest, ipcBridgeSubscription } from './internal/bridge'
export type UpdaterStatus = {
  state:
    | 'unavailable'
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'failed'
}
export const ipcUpdaterGetStatus = () => ipcBridgeRequest<UpdaterStatus>('updater:status')
export const ipcUpdaterCheckForUpdates = () =>
  ipcBridgeRequest<unknown>('updater:check-for-updates')
export const ipcUpdaterCheckForUpdatesAndNotify = () =>
  ipcBridgeRequest<unknown>('updater:check-for-updates-and-notify')
export const ipcUpdaterDownloadUpdate = () => ipcBridgeRequest<string[]>('updater:download-update')
export const ipcUpdaterQuitAndInstall = () => ipcBridgeRequest<void>('updater:quit-and-install')
export const ipcUpdaterOnCheckingForUpdate = (listener: () => void) =>
  ipcBridgeSubscription('updater:checking-for-update', listener)
export const ipcUpdaterOnUpdateAvailable = (listener: (info: unknown) => void) =>
  ipcBridgeSubscription('updater:update-available', listener)
export const ipcUpdaterOnUpdateNotAvailable = (listener: () => void) =>
  ipcBridgeSubscription('updater:update-not-available', listener)
export const ipcUpdaterOnDownloadProgress = (
  listener: (progress: {
    percent: number
    transferred: number
    total: number
    bytesPerSecond: number
  }) => void,
) => ipcBridgeSubscription('updater:download-progress', listener)
export const ipcUpdaterOnUpdateDownloaded = (listener: () => void) =>
  ipcBridgeSubscription('updater:update-downloaded', listener)
export const ipcUpdaterOnError = (listener: (error: AppErrorDto) => void) =>
  ipcBridgeSubscription('updater:error', listener)
