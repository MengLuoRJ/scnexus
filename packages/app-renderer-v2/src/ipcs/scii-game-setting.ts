import { ipcDesktop, ipcRequest } from './internal/ipc-common'

export const ipcGameSettingGet = () => ipcRequest(() => ipcDesktop().gameSetting.get())
export const ipcGameSettingInitialize = (path?: string) =>
  ipcRequest(() => ipcDesktop().gameSetting.initialize(path))
export const ipcGameSettingConfigure = (path: string) =>
  ipcRequest(() => ipcDesktop().gameSetting.configure(path))
export const ipcGameSettingRefresh = () => ipcRequest(() => ipcDesktop().gameSetting.refresh())
