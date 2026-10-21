import { test, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { BrowserWindowConstructorOptions } from 'electron'
const instances: FakeWindow[] = []
class FakeWindow extends EventEmitter {
  destroyed = false
  minimized = false
  webContents = Object.assign(new EventEmitter(), {
    send: vi.fn<import('electron').WebContents['send']>(),
    isLoadingMainFrame: (): boolean => false,
    openDevTools: vi.fn<import('electron').WebContents['openDevTools']>(),
    setWindowOpenHandler: vi.fn<import('electron').WebContents['setWindowOpenHandler']>(),
  })
  constructor(readonly options: BrowserWindowConstructorOptions) {
    super()
    instances.push(this)
  }
  isDestroyed() {
    return this.destroyed
  }
  isMinimized() {
    return this.minimized
  }
  isMaximized() {
    return false
  }
  restore() {
    this.minimized = false
  }
  show() {}
  focus() {}
  async loadFile() {}
  async loadURL() {}
  destroy() {
    this.destroyed = true
    this.emit('closed')
  }
}
vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
  BrowserWindow: FakeWindow,
}))
vi.mock('../../logging/logging', () => ({
  reportError: vi.fn<typeof import('../../logging/logging').reportError>(),
}))
vi.mock('../../shell', () => ({
  openExternalWebsite: vi.fn<typeof import('../../shell').openExternalWebsite>(),
}))
const service = await import('../window')
test('window singleton, reload handshake, renderer failure and recreation', async () => {
  const [a, b] = await Promise.all([
    service.restoreOrCreateWindow(),
    service.restoreOrCreateWindow(),
  ])
  expect(a).toBe(b)
  expect(instances).toHaveLength(1)
  expect(instances[0].options).toMatchObject({
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    width: 1000,
    height: 700,
    minWidth: 1000,
    minHeight: 700,
  })
  service.sendWhenReady('updater:download-progress', 1)
  service.sendWhenReady('updater:download-progress', 2)
  service.markWindowReady()
  expect(instances[0].webContents.send).toHaveBeenCalledWith('updater:download-progress', 2)
  instances[0].webContents.emit('did-start-navigation', {}, '', false, true)
  expect(service.getWindowStatus().state).toBe('loading')
  service.sendWhenReady('deeplink:open', 1)
  service.sendWhenReady('deeplink:open', 2)
  service.markWindowReady()
  expect(instances[0].webContents.send).toHaveBeenCalledWith('deeplink:open', 1)
  expect(instances[0].webContents.send).toHaveBeenCalledWith('deeplink:open', 2)
  instances[0].webContents.emit('render-process-gone')
  expect(service.getWindowStatus().state).toBe('failed')
  service.destroyMainWindow()
  await service.restoreOrCreateWindow()
  expect(instances).toHaveLength(2)
  expect(instances[1].options).toMatchObject({
    width: 1000,
    height: 700,
    minWidth: 1000,
    minHeight: 700,
  })
  service.destroyMainWindow()
})

test('load failure includes underlying Electron reason and permits later recreation', async () => {
  const failure = vi
    .spyOn(FakeWindow.prototype, 'loadURL')
    .mockRejectedValueOnce(new Error('ERR_CONNECTION_REFUSED (-102)'))
  await expect(service.restoreOrCreateWindow()).rejects.toMatchObject({
    code: 'M017',
    message: expect.stringContaining('ERR_CONNECTION_REFUSED (-102)'),
  })
  expect(service.getMainWindow()).toBeNull()
  failure.mockRestore()
  await service.restoreOrCreateWindow()
  service.destroyMainWindow()
})

test('early readiness waits for load completion and pending readiness does not survive navigation', async () => {
  await service.restoreOrCreateWindow()
  const window = instances.at(-1)!
  const loading = vi.spyOn(window.webContents, 'isLoadingMainFrame').mockReturnValue(true)
  service.sendWhenReady('test:early', 1)
  expect(service.markWindowReady().state).toBe('loading')
  expect(window.webContents.send).not.toHaveBeenCalledWith('test:early', 1)
  loading.mockReturnValue(false)
  window.webContents.emit('did-finish-load')
  expect(service.getWindowStatus().state).toBe('ready')
  expect(window.webContents.send).toHaveBeenCalledWith('test:early', 1)
  window.webContents.emit('did-start-navigation', {}, '', false, true)
  loading.mockReturnValue(true)
  service.markWindowReady()
  window.webContents.emit('did-start-navigation', {}, '', false, true)
  loading.mockReturnValue(false)
  window.webContents.emit('did-finish-load')
  expect(service.getWindowStatus().state).toBe('loading')
  service.markWindowReady()
  expect(service.getWindowStatus().state).toBe('ready')
  service.destroyMainWindow()
})
