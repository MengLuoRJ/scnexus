import type { IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import { getMainWindow } from '../modules/window/window'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { isTrustedRendererUrl } from '../modules/window/origin'

export function assertIpcSource(event: IpcMainInvokeEvent | IpcMainEvent): void {
  const window = getMainWindow()
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    !event.senderFrame ||
    event.senderFrame !== event.sender.mainFrame ||
    !isTrustedRendererUrl(
      event.senderFrame.url,
      import.meta.env.DEV ? import.meta.env.VITE_DEV_SERVER_URL : undefined,
    )
  ) {
    throw new AppError(ERRORS.IPC_SOURCE_REJECTED)
  }
}
