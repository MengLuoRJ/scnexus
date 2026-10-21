import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { APPLICATION_ENTRY } from './origin'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import type { WindowStatus } from '@scnexus/app-shared/types/desktop.type'
import { reportError } from '../logging/logging'
import { openExternalWebsite } from '../shell'

let mainWindow: BrowserWindow | null = null
let creation: Promise<BrowserWindow> | undefined
let state: WindowStatus['state'] = 'absent'
let readyRequested = false
const queue: { channel: string; args: unknown[] }[] = []
const readyListeners = new Set<() => void>()

export function getMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}
export function getWindowStatus(): WindowStatus {
  const window = getMainWindow()
  return {
    state,
    minimized: window?.isMinimized() ?? false,
    maximized: window?.isMaximized() ?? false,
  }
}
function publishStatus() {
  getMainWindow()?.webContents.send('window:status', getWindowStatus())
}
export function onWindowReady(listener: () => void) {
  readyListeners.add(listener)
  return () => readyListeners.delete(listener)
}
export function markWindowReady() {
  const window = getMainWindow()
  if (!window) throw new AppError(ERRORS.WINDOW_NOT_READY)
  if (window.webContents.isLoadingMainFrame()) {
    readyRequested = true
    return getWindowStatus()
  }
  if (state === 'ready') return getWindowStatus()
  readyRequested = false
  state = 'ready'
  for (const item of queue.splice(0)) window.webContents.send(item.channel, ...item.args)
  for (const listener of readyListeners) listener()
  publishStatus()
  return getWindowStatus()
}
export function sendWhenReady(channel: string, ...args: unknown[]) {
  const window = getMainWindow()
  if (state === 'ready' && window) {
    window.webContents.send(channel, ...args)
    return
  }
  if (!channel.startsWith('deeplink:')) {
    const previous = queue.findIndex((item) => item.channel === channel)
    if (previous >= 0) {
      queue[previous] = { channel, args }
      return
    }
  }
  if (queue.length >= 32) throw new AppError(ERRORS.DEEP_LINK_QUEUE_FULL)
  queue.push({ channel, args })
}
export function destroyMainWindow() {
  getMainWindow()?.destroy()
  mainWindow = null
  readyRequested = false
  state = 'absent'
}

async function createMainWindow(): Promise<BrowserWindow> {
  let window: BrowserWindow
  try {
    window = new BrowserWindow({
      title: 'SCNexus Client',
      show: false,
      width: 1000,
      height: 700,
      minWidth: 1000,
      minHeight: 700,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(app.getAppPath(), 'packages', 'app-preload', 'dist', 'index.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
  } catch (cause) {
    state = 'failed'
    throw new AppError(ERRORS.WINDOW_CREATE_FAILED, {}, { cause })
  }
  mainWindow = window
  state = 'loading'
  readyRequested = false
  window.once('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
      readyRequested = false
      state = 'absent'
    }
  })
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      window.show()
      if (import.meta.env.DEV) window.webContents.openDevTools()
    }
  })
  window.on('minimize', publishStatus)
  window.on('restore', publishStatus)
  window.on('maximize', publishStatus)
  window.on('unmaximize', publishStatus)
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) {
      readyRequested = false
      state = 'loading'
    }
  })
  window.webContents.on('did-finish-load', () => {
    if (mainWindow === window && readyRequested) markWindowReady()
  })
  window.webContents.on('render-process-gone', () => {
    readyRequested = false
    state = 'failed'
    reportError(new AppError(ERRORS.WINDOW_RENDERER_FAILED), 'window')
  })
  const target =
    import.meta.env.DEV && import.meta.env.VITE_DEV_SERVER_URL
      ? import.meta.env.VITE_DEV_SERVER_URL
      : APPLICATION_ENTRY
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== target.split('#')[0]) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void openExternalWebsite(url).catch((error) => reportError(error, 'shell'))
    }
    return { action: 'deny' }
  })
  try {
    await window.loadURL(target)
    return window
  } catch (cause) {
    window.destroy()
    state = 'failed'
    throw new AppError(
      ERRORS.WINDOW_LOAD_FAILED,
      {
        message: `Failed to load ${target}: ${cause instanceof Error ? cause.message : String(cause)}`,
      },
      { cause },
    )
  }
}

export async function restoreOrCreateWindow(): Promise<BrowserWindow> {
  const current = getMainWindow()
  if (!creation && !current) {
    creation = createMainWindow()
    try {
      await creation
    } finally {
      creation = undefined
    }
  } else if (creation) await creation
  const window = getMainWindow()
  if (!window) throw new AppError(ERRORS.WINDOW_NOT_READY)
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  return window
}

export function minimizeMainWindow() {
  getMainWindow()?.minimize()
  return getWindowStatus()
}
export function setMainWindowMaximized(value: boolean) {
  if (typeof value !== 'boolean') throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  if (value) getMainWindow()?.maximize()
  else getMainWindow()?.unmaximize()
  return getWindowStatus()
}
export function closeMainWindow() {
  getMainWindow()?.close()
}
