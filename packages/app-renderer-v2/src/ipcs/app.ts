import { ipcDesktop, ipcRequest } from './internal/ipc-common'

export const ipcAppGetVersion = () => ipcRequest(() => ipcDesktop().app.getVersion())

import { ipcBridgeRequest } from './internal/bridge'
export const ipcAppIsPackaged = () => ipcBridgeRequest<boolean>('app:is-packaged')
export const ipcAppGetLocale = () => ipcBridgeRequest<string>('app:get-locale')
export const ipcAppGetSystemLocale = () => ipcBridgeRequest<string>('app:get-system-locale')
export const ipcAppGetLocaleCountryCode = () =>
  ipcBridgeRequest<string>('app:get-locale-country-code')
export const ipcAppGetPreferredSystemLanguages = () =>
  ipcBridgeRequest<string[]>('app:get-preferred-system-languages')
export const ipcAppGetPath = (name: string) => ipcBridgeRequest<string>('app:get-path', name)
export const ipcAppGetPaths = () =>
  ipcBridgeRequest<
    Record<'home' | 'userData' | 'appData' | 'documents' | 'logs' | 'crashDumps', string>
  >('app:get-paths')
