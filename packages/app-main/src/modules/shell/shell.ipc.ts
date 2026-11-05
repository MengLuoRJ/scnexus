import { ipcHandle } from '@/utils/ipc-util'
import { openExternalDownload, openExternalWebsite, openPath, showItemInFolder } from './shell'

export function initShellIpc() {
  ipcHandle('shell:open-external-website', openExternalWebsite)
  ipcHandle('shell:open-external-download', openExternalDownload)
  ipcHandle('shell:open-path', openPath)
  ipcHandle('shell:show-item-in-folder', showItemInFolder)
}
