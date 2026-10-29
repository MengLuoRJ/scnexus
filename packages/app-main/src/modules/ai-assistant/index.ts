import { BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { settingRepository } from '../../stores/setting'
import { ipcHandleRegister, ipcHandleRemove } from '../../utils/ipc-util'
import { assertIpcSource } from '../../utils/ipc-source'
import { createAiAssistantService } from './service'
import { createReadOnlyAiAssistantTools } from './tools'
import * as local from './local-data'

let service: ReturnType<typeof createAiAssistantService> | undefined
function publish(channel: string, value: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    try {
      assertIpcSource({
        sender: window.webContents,
        senderFrame: window.webContents.mainFrame,
      } as IpcMainInvokeEvent)
      window.webContents.send(channel, value)
    } catch {
      // Navigation and closed windows must not interrupt the local MCP service.
    }
  }
}
const methods = [
  'getStatus',
  'start',
  'stop',
  'regenerateToken',
  'getConnectionInfo',
  'listRecords',
  'clearRecords',
] as const
export function initAiAssistantModule() {
  if (service) return
  service = createAiAssistantService({
    isEnabled: () => settingRepository.getSnapshot().aiAssistantEnabled,
    tools: createReadOnlyAiAssistantTools(local),
    onStatusChanged: (value) => publish('ai-assistant:statusChanged', value),
    onRecordChanged: (value) => publish('ai-assistant:recordChanged', value),
  })
  for (const method of methods)
    ipcHandleRegister(`ai-assistant:${method}`, async (...args: unknown[]) => {
      if (args.length !== (method === 'start' ? 1 : 0))
        throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
      if (!service) throw new AppError(ERRORS.IPC_TRANSPORT_FAILED)
      try {
        if (method === 'start') {
          const port = args[0]
          if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535)
            throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
          return await service.start(port)
        }
        if (method === 'clearRecords') {
          service.clearRecords()
          return {}
        }
        return await service[method]()
      } catch (error) {
        if (error instanceof AppError) throw error
        const message =
          error instanceof Error && /^AI_ASSISTANT_[A-Z_]+$/.test(error.message)
            ? error.message
            : 'AI_ASSISTANT_FAILED'
        throw new AppError(ERRORS.IPC_TRANSPORT_FAILED, { message })
      }
    })
}
export async function setAiAssistantEnabled(enabled: boolean) {
  if (!enabled) await service?.stop()
}
export async function disposeAiAssistant() {
  const instance = service
  service = undefined
  for (const method of methods) ipcHandleRemove(`ai-assistant:${method}`)
  await instance?.dispose()
}
