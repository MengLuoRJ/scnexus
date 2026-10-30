import { ipcMain } from 'electron'
import { assertIpcSource } from '../../utils/ipc-source'
import { ipcHandle } from '../../utils/ipc-util'
import { isErrorDto } from '@scnexus/app-shared/errors/app.error'
import { LOG_LEVELS, type LogInput } from '@scnexus/app-shared/types/desktop.type'
import { getLogConfig, writeLog } from './logging'
import { reportRendererError } from '../telemetry/telemetry'
import { updateSetting } from '../setting/setting'

export function initLoggingIpc() {
  ipcHandle('logging:get-config', getLogConfig)
  ipcHandle('logging:set-level', (level: unknown) => updateSetting({ logLevel: level }))
  ipcMain.removeAllListeners('logging:write')
  ipcMain.on('logging:write', (event, raw: unknown, source: unknown) => {
    try {
      assertIpcSource(event)
      if (!raw || typeof raw !== 'object') return
      const value = raw as LogInput
      if (
        !LOG_LEVELS.includes(value.level) ||
        typeof value.scope !== 'string' ||
        value.scope.length > 100 ||
        typeof value.message !== 'string' ||
        value.message.length > 8192 ||
        (value.error !== undefined && !isErrorDto(value.error)) ||
        (value.errorStack !== undefined &&
          (typeof value.errorStack !== 'string' || value.errorStack.length > 8192)) ||
        (value.taskId !== undefined &&
          (typeof value.taskId !== 'string' || value.taskId.length > 200))
      )
        return
      const size = JSON.stringify(value).length
      if (size > 16384) return
      writeLog(value, source === 'preload' ? 'preload' : 'renderer')
      if (value.error)
        reportRendererError(
          value.error,
          value.errorStack,
          value.scope,
          source === 'preload' ? 'preload' : 'renderer',
        )
    } catch {
      return
    }
  })
}
