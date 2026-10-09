import { desktop, request } from './internal/ipc-common'

export const apiAppGetVersion = () => request(() => desktop().app.getVersion())

import { bridgeRequest } from './internal/bridge'
export const apiAppIsPackaged = () => bridgeRequest<boolean>('app:is-packaged')
export const apiAppGetLocale = () => bridgeRequest<string>('app:get-locale')
export const apiAppGetSystemLocale = () => bridgeRequest<string>('app:get-system-locale')
export const apiAppGetLocaleCountryCode = () => bridgeRequest<string>('app:get-locale-country-code')
export const apiAppGetPreferredSystemLanguages = () =>
  bridgeRequest<string[]>('app:get-preferred-system-languages')
export const apiAppGetPath = (name: string) => bridgeRequest<string>('app:get-path', name)
export const apiAppGetPaths = () =>
  bridgeRequest<
    Record<'home' | 'userData' | 'appData' | 'documents' | 'logs' | 'crashDumps', string>
  >('app:get-paths')
