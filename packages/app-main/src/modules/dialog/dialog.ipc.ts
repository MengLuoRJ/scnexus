import { ipcHandle } from '@/utils/ipc-util'
import { showOpenDialog, showOpenDialogSync } from './dialog'

export function initDialogIpc() {
  ipcHandle('dialog:show-open-dialog-sync', showOpenDialogSync)
  ipcHandle('dialog:show-open-dialog', showOpenDialog)
}
