import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ERRORS, normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import { assertIpcSource } from './ipc-source'
import { reportError } from '../modules/logging/logging'
import { getGamePaths } from '../modules/scii-game-setting/scii-game-setting'
import { withOperationWarnings } from './operation-warnings'

async function guard(channel: string, event: IpcMainInvokeEvent) {
  assertIpcSource(event)
  if (/^(campaign|customize):/.test(channel)) await getGamePaths()
}

// IPC handlers have channel-specific parameters validated by each handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IpcHandler = (...args: any[]) => any

function register(channel: string, func: IpcHandler, passEvent: boolean) {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      const { data, warnings } = await withOperationWarnings(channel, async () => {
        await guard(channel, event)
        return passEvent ? func(event, ...args) : func(...args)
      })
      return { ok: true, data, ...(warnings.length ? { warnings } : {}) }
    } catch (value) {
      const error = normalizeError(value)
      const dto = toErrorDto(error)
      try {
        if (error.code !== ERRORS.TASK_CANCELLED.code) reportError(error, channel)
      } catch {
        // Logging is secondary to returning the original IPC failure.
      }
      return { ok: false, error: dto }
    }
  })
}
export function ipcHandleRegister(channel: string, func: IpcHandler, passEvent = false) {
  register(channel, func, passEvent)
}
export function ipcHandleRemove(channel: string) {
  ipcMain.removeHandler(channel)
}
export function ipcHandle(channel: string, func: IpcHandler, passEvent = false) {
  register(channel, func, passEvent)
}
export type ipcHandleConfig = {
  channel: string
  function: IpcHandler
  passEvent: boolean
}
