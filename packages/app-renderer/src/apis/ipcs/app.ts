import { ipcApi, useIpcApi } from './ipc-util'

export const apiAppGetVersion = () =>
  useIpcApi<string>('apiAppGetVersion', ipcApi['app:get-version']())
export const apiAppIsPackaged = () =>
  useIpcApi<boolean>('apiAppIsPackaged', ipcApi['app:is-packaged']())
export const apiAppGetLocale = () => useIpcApi<string>('apiAppGetLocale', ipcApi['app:get-locale']())
export const apiAppGetSystemLocale = () =>
  useIpcApi<string>('apiAppGetSystemLocale', ipcApi['app:get-system-locale']())
export const apiAppGetLocaleCountryCode = () =>
  useIpcApi<string>('apiAppGetLocaleCountryCode', ipcApi['app:get-locale-country-code']())
export const apiAppGetPreferredSystemLanguages = () =>
  useIpcApi<string[]>(
    'apiAppGetPreferredSystemLanguages',
    ipcApi['app:get-preferred-system-languages'](),
  )
export const apiAppGetPath = (
  name:
    | 'home'
    | 'appData'
    | 'userData'
    | 'sessionData'
    | 'temp'
    | 'exe'
    | 'module'
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'music'
    | 'pictures'
    | 'videos'
    | 'recent'
    | 'logs'
    | 'crashDumps',
) => useIpcApi<string>('apiAppGetPath', ipcApi['app:get-path'](name))
export const apiAppGetPaths = () =>
  useIpcApi<{ [key: string]: string }>('apiAppGetPaths', ipcApi['app:get-paths']())
