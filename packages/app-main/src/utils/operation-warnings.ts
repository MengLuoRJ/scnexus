import { AsyncLocalStorage } from 'node:async_hooks'
import {
  AppError,
  ERRORS,
  toErrorDto,
  type AppErrorDto,
} from '@scnexus/app-shared/errors/app.error'
import { writeLog } from '../modules/logging/logging'

type WarningScope = { scope: string; warnings: AppErrorDto[]; active: boolean }
const operationWarnings = new AsyncLocalStorage<WarningScope>()

export async function withOperationWarnings<T>(scope: string, run: () => Promise<T>) {
  const context: WarningScope = { scope, warnings: [], active: true }
  return operationWarnings.run(context, async () => {
    try {
      const data = await run()
      return { data, warnings: context.warnings }
    } finally {
      context.active = false
    }
  })
}

export function reportOperationWarning(error: AppError): void {
  const context = operationWarnings.getStore()
  try {
    const dto = toErrorDto(error)
    if (context?.active && !context.warnings.some((warning) => warning.errorId === dto.errorId))
      context.warnings.push(dto)
    writeLog({
      level: 'warn',
      scope: context?.scope ?? 'operation',
      message: `${error.code} ${error.name}`,
      error: dto,
      taskId: dto.taskId,
    })
  } catch {
    // Notification and logging failures must never change the operation outcome.
  }
}

export function notifyOperation(callback: () => void, taskId?: string): void {
  try {
    callback()
  } catch (cause) {
    reportOperationWarning(
      new AppError(
        ERRORS.WINDOW_NOT_READY,
        {
          message: 'Operation progress notification failed',
          taskId,
        },
        { cause },
      ),
    )
  }
}
