import type { IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import { getMainWindow } from '../modules/window/window'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'

export function assertIpcSource(event: IpcMainInvokeEvent | IpcMainEvent): void {
  const window = getMainWindow()
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    !event.senderFrame ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new AppError(ERRORS.IPC_SOURCE_REJECTED)
  }
}
