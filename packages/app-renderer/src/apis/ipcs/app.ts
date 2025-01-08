import { useIpcApi } from './ipc-util'

export const apiAppGetVersion = () =>
  useIpcApi<string>('apiAppGetVersion', window.apiAppGetVersion())
export const apiAppIsPackaged = () =>
  useIpcApi<boolean>('apiAppIsPackaged', window.apiAppIsPackaged())
export const apiAppGetLocale = () => useIpcApi<string>('apiAppGetLocale', window.apiAppGetLocale())
export const apiAppGetSystemLocale = () =>
  useIpcApi<string>('apiAppGetSystemLocale', window.apiAppGetSystemLocale())
export const apiAppGetLocaleCountryCode = () =>
  useIpcApi<string>('apiAppGetLocaleCountryCode', window.apiAppGetLocaleCountryCode())
export const apiAppGetPreferredSystemLanguages = () =>
  useIpcApi<string[]>(
    'apiAppGetPreferredSystemLanguages',
    window.apiAppGetPreferredSystemLanguages(),
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
) => useIpcApi<string>('apiAppGetPath', window.apiAppGetPath(name))
export const apiAppGetPaths = () =>
  useIpcApi<{ [key: string]: string }>('apiAppGetPaths', window.apiAppGetPaths())
