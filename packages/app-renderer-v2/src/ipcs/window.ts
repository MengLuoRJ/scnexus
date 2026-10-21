import { ipcDesktop, ipcRequest, ipcSubscription } from './internal/ipc-common'
import type { DesktopApi } from '@scnexus/app-shared/types/desktop.type'

export const ipcWindowGetStatus = () => ipcRequest(() => ipcDesktop().window.getStatus())
export const ipcWindowShow = () => ipcRequest(() => ipcDesktop().window.show())
export const ipcWindowMinimize = () => ipcRequest(() => ipcDesktop().window.minimize())
export const ipcWindowSetMaximized = (value: boolean) =>
  ipcRequest(() => ipcDesktop().window.setMaximized(value))
export const ipcWindowClose = () => ipcRequest(() => ipcDesktop().window.close())
export const ipcWindowReady = () => ipcRequest(() => ipcDesktop().window.ready())
export const ipcWindowOnStatus = (listener: Parameters<DesktopApi['window']['onStatus']>[0]) =>
  ipcSubscription((callback) => ipcDesktop().window.onStatus(callback), listener)
