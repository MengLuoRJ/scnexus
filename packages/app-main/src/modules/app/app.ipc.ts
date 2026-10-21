import { ipcHandle } from '@/utils/ipc-util'
import * as application from './app'

export function initAppIpc() {
  ipcHandle('app:get-device-name', application.getDeviceName)
  ipcHandle('app:get-version-v2', application.getVersion)
  ipcHandle('app:get-version', application.getVersion)
  ipcHandle('app:is-packaged', application.isPackaged)
  ipcHandle('app:get-locale', application.getLocale)
  ipcHandle('app:get-system-locale', application.getSystemLocale)
  ipcHandle('app:get-locale-country-code', application.getLocaleCountryCode)
  ipcHandle('app:get-preferred-system-languages', application.getPreferredSystemLanguages)
  ipcHandle('app:get-path', application.getPath)
  ipcHandle('app:get-paths', application.getPaths)
}
