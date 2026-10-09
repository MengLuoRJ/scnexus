import { initTrayIpc } from './tray.ipc'
export * from './tray'
export function initTrayModule() {
  initTrayIpc()
}
