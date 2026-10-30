import type { App } from 'vue'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import { ipcLoggingWrite } from '../ipcs/logging'

export function installErrorReporting(app: App, target: Window = window): () => void {
  const previous = app.config.errorHandler
  const reported = new WeakSet<object>()
  let count = 0
  let since = Date.now()
  function report(value: unknown, scope: string) {
    try {
      if (!window.scnexus) return
      if (Date.now() - since >= 60000) {
        since = Date.now()
        count = 0
      }
      if (count >= 20) return
      if (value && typeof value === 'object') {
        if (reported.has(value)) return
        reported.add(value)
      }
      count++
      const message =
        value instanceof Error
          ? value.message
          : typeof value === 'string'
            ? value
            : 'Unhandled renderer error'
      const error =
        value instanceof AppError
          ? value
          : new AppError(ERRORS.APP_UNEXPECTED_ERROR, { message: message.slice(0, 2000) })
      ipcLoggingWrite({
        level: 'error',
        scope,
        message: `${error.code} ${error.name}`,
        error: { ...toErrorDto(error), message: error.message.slice(0, 2000) },
        ...(value instanceof Error && value.stack
          ? { errorStack: value.stack.slice(0, 6000) }
          : {}),
      })
    } catch {
      return
    }
  }
  const vueError: NonNullable<App['config']['errorHandler']> = (error) => report(error, 'vue')
  const windowError = (event: ErrorEvent) => report(event.error ?? event.message, 'renderer-error')
  const rejection = (event: PromiseRejectionEvent) => report(event.reason, 'renderer-rejection')
  app.config.errorHandler = vueError
  target.addEventListener('error', windowError)
  target.addEventListener('unhandledrejection', rejection)
  return () => {
    if (app.config.errorHandler === vueError) app.config.errorHandler = previous
    target.removeEventListener('error', windowError)
    target.removeEventListener('unhandledrejection', rejection)
  }
}
