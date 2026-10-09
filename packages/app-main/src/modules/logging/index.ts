import { initializeLogging } from './logging'
import { initLoggingIpc } from './logging.ipc'
export * from './logging'

export function initLoggingModule() {
  initializeLogging()
  initLoggingIpc()
}
