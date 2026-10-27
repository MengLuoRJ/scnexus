import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { ipcHandle, ipcHandleRemove } from '../../utils/ipc-util'
import type { WorkshopService } from './service'

export function initWorkshopIpc(service: WorkshopService) {
  const handlers = {
    'workshop:list': service.list,
    'workshop:select-package': service.selectPackage,
    'workshop:download': service.download,
    'workshop:upload': service.upload,
    'workshop:select-image': service.selectImage,
    'workshop:pause': async (taskId: string) => {
      if (!(await service.list()).some((task) => task.taskId === taskId))
        throw new Error('TASK_NOT_FOUND')
      return service.pause(taskId)
    },
    'workshop:resume': service.resume,
    'workshop:cancel': service.cancel,
    'workshop:install-source': service.installSource,
  }
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcHandle(channel, async (...args: unknown[]) => {
      try {
        return await (handler as (...values: unknown[]) => unknown)(...args)
      } catch (error) {
        const code =
          error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
            ? error.message
            : 'WORKSHOP_OPERATION_FAILED'
        throw new AppError(ERRORS.IPC_INVALID_ARGUMENT, { message: code })
      }
    })
  }
  return () => {
    for (const channel of Object.keys(handlers)) ipcHandleRemove(channel)
  }
}
