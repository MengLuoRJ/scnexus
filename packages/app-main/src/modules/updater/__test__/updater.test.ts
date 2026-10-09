import { test, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const mock = vi.hoisted(() => ({
  send: vi.fn(),
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
}))
vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('../../logging', () => ({ Logger: { info: vi.fn() } }))
vi.mock('../../window', () => ({ sendWhenReady: mock.send }))
let instance: EventEmitter
vi.mock('electron-updater', () => ({
  NsisUpdater: class extends EventEmitter {
    constructor() {
      super()
      instance = this
    }
    checkForUpdates = mock.check
    checkForUpdatesAndNotify = mock.check
    downloadUpdate = mock.download
    quitAndInstall = mock.install
  },
}))
import * as service from '../updater'
test('Windows updater classifies failures and cleans up before explicit installation', async () => {
  service.initializeUpdater()
  await expect(service.quitAndInstall()).rejects.toMatchObject({
    code: 'M029',
  })
  mock.check.mockRejectedValueOnce(new Error('check'))
  await expect(service.checkForUpdates()).rejects.toMatchObject({
    code: 'M027',
  })
  expect(mock.send.mock.calls.at(-1)?.[1].code).toBe('M027')
  mock.check.mockResolvedValueOnce({})
  await service.checkForUpdates()
  instance.emit('update-available', {})
  mock.download.mockRejectedValueOnce(new Error('download'))
  await expect(service.downloadUpdate()).rejects.toMatchObject({
    code: 'M028',
  })
  instance.emit('update-available', {})
  mock.download.mockResolvedValueOnce([])
  await service.downloadUpdate()
  instance.emit('update-downloaded')
  const cleanup = vi.fn(async () => {
    expect(mock.install).not.toHaveBeenCalled()
  })
  service.setBeforeUpdateInstall(cleanup)
  await service.quitAndInstall()
  expect(cleanup).toHaveBeenCalledOnce()
  expect(mock.install).toHaveBeenCalledOnce()
  expect(service.isInstallingUpdate()).toBe(true)
  instance.emit('error', new Error('install'))
  expect(mock.send.mock.calls.at(-1)?.[1].code).toBe('M029')
  expect(service.isInstallingUpdate()).toBe(false)
})
