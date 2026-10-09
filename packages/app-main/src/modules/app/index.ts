import { initAppIpc } from './app.ipc'
export * from './app'

export function initAppModule() {
  initAppIpc()
}
