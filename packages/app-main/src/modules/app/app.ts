import { app } from 'electron'
import { hostname } from 'node:os'

export const getDeviceName = () => hostname().trim().slice(0, 80) || 'SCNexus Desktop'

export const getVersion = () => app.getVersion()
export const isPackaged = () => app.isPackaged
export const getLocale = () => app.getLocale()
export const getSystemLocale = () => app.getSystemLocale()
export const getLocaleCountryCode = () => app.getLocaleCountryCode()
export const getPreferredSystemLanguages = () => app.getPreferredSystemLanguages()
export const getPath = (name: Parameters<typeof app.getPath>[0]) => app.getPath(name)
export function getPaths() {
  return {
    home: app.getPath('home'),
    userData: app.getPath('userData'),
    appData: app.getPath('appData'),
    documents: app.getPath('documents'),
    logs: app.getPath('logs'),
    crashDumps: app.getPath('crashDumps'),
  }
}
