import { initShellIpc } from './shell.ipc'
export { openExternalWebsite, openPath, showItemInFolder } from './shell'

export function initShellModule() {
  initShellIpc()
}
