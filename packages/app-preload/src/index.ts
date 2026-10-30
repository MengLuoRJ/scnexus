import { contextBridge, webUtils } from 'electron'
import '@sentry/electron/preload'
import './ipc/index.js'

contextBridge.exposeInMainWorld('webUtils', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
