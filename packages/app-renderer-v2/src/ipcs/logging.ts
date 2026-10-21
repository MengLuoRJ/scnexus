import { ipcDesktop, ipcRequest, ipcSnapshot } from './internal/ipc-common'
import type { LogLevel, LogInput } from '@scnexus/app-shared/types/desktop.type'

export const ipcLoggingGetConfig = () => ipcRequest(() => ipcDesktop().logging.getConfig())
export const ipcLoggingSetLevel = (level: LogLevel) =>
  ipcRequest(() => ipcDesktop().logging.setLevel(level))
export const ipcLoggingWrite = (input: LogInput) => ipcDesktop().logging.write(ipcSnapshot(input))
