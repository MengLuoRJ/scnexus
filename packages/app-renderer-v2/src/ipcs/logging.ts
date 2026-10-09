import { desktop, request, ipcSnapshot } from './internal/ipc-common'
import type { LogLevel, LogInput } from '@scnexus/app-shared/types/desktop.type'

export const apiLoggingGetConfig = () => request(() => desktop().logging.getConfig())
export const apiLoggingSetLevel = (level: LogLevel) =>
  request(() => desktop().logging.setLevel(level))
export const apiLoggingWrite = (input: LogInput) => desktop().logging.write(ipcSnapshot(input))
