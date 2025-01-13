import { ipcApi, useIpcApi } from './ipc-util'
import type { OpenDialogOptions, OpenDialogReturnValue, OpenDialogSyncOptions } from 'electron'

export const apiDialogShowOpenDialogSync = (options: OpenDialogSyncOptions) =>
  useIpcApi<string[]>(
    'apiDialogShowOpenDialogSync',
    ipcApi['dialog:show-open-dialog-sync'](options),
  )
export const apiDialogShowOpenDialog = (options: OpenDialogOptions) =>
  useIpcApi<OpenDialogReturnValue>(
    'apiDialogShowOpenDialog',
    ipcApi['dialog:show-open-dialog'](options),
  )
