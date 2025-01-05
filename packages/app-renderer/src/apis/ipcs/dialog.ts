import { useIpcApi } from './ipc-util'
import type { OpenDialogOptions, OpenDialogReturnValue, OpenDialogSyncOptions } from 'electron'

export const apiDialogShowOpenDialogSync = (options: OpenDialogSyncOptions) =>
  useIpcApi<string[]>('apiDialogShowOpenDialogSync', window.apiDialogShowOpenDialogSync(options))
export const apiDialogShowOpenDialog = (options: OpenDialogOptions) =>
  useIpcApi<OpenDialogReturnValue>(
    'apiDialogShowOpenDialog',
    window.apiDialogShowOpenDialog(options),
  )
