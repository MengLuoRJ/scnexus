import { initCustomizeIpc } from './customize.ipc'
export * from './customize'
export function initCustomizeModule() {
  initCustomizeIpc()
}
