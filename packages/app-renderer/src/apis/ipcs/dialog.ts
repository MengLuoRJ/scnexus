import { useIpcApi } from './ipc-util'
import type { OpenDialogOptions, OpenDialogReturnValue, OpenDialogSyncOptions } from 'electron'

export const ipcDialog = {
  showOpenDialogSync: (options: OpenDialogSyncOptions) =>
    useIpcApi<string[]>('apiDialogShowOpenDialogSync', window.apiDialogShowOpenDialogSync(options)),

  showOpenDialog: (options: OpenDialogOptions) =>
    useIpcApi<OpenDialogReturnValue>(
      'apiDialogShowOpenDialog',
      window.apiDialogShowOpenDialog(options),
    ),
}
