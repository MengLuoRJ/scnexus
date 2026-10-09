import { initUpdaterIpc } from './updater.ipc'
import { initializeUpdater } from './updater'
export * from './updater'

export function initUpdaterModule() {
  initUpdaterIpc()
  initializeUpdater()
}
