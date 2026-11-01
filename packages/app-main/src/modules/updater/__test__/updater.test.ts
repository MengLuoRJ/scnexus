import { test, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const mock = vi.hoisted(() => ({
  send: vi.fn<
    (channel: string, error?: import('@scnexus/app-shared/errors/app.error').AppErrorDto) => void
  >(),
  feed: vi.fn<import('electron-updater').NsisUpdater['setFeedURL']>(),
  check: vi.fn<import('electron-updater').NsisUpdater['checkForUpdates']>(),
  download: vi.fn<import('electron-updater').NsisUpdater['downloadUpdate']>(),
  install: vi.fn<import('electron-updater').NsisUpdater['quitAndInstall']>(),
}))
vi.mock('../../../stores/setting', () => ({ getSettingStore: () => ({ updateChannel: 'stable' }) }))
vi.mock('electron', () => ({ app: { isPackaged: true, getVersion: () => '0.1.0-snapshot.7' } }))
vi.mock('../../logging', () => ({ Logger: { info: vi.fn<(message: string) => void>() } }))
vi.mock('../../window', () => ({ sendWhenReady: mock.send }))
const instances: EventEmitter[] = []
vi.mock('electron-updater', () => ({
  NsisUpdater: class extends EventEmitter {
    constructor() {
      super()
      instances.push(this)
    }
    setFeedURL = mock.feed
    allowPrerelease = false
    allowDowngrade = false
    checkForUpdates = mock.check
    checkForUpdatesAndNotify = mock.check
    downloadUpdate = mock.download
    quitAndInstall = mock.install
  },
}))
import * as service from '../updater'
test('Windows updater classifies failures and cleans up before explicit installation', async () => {
  service.initializeUpdater()
  const instance = instances[0]
  expect(service.getUpdaterStatus().channel).toBe('stable')
  service.setUpdaterChannel('snapshot')
  expect(mock.feed).toHaveBeenLastCalledWith(
    expect.objectContaining({ url: service.UPDATE_FEEDS.snapshot, channel: 'latest' }),
  )
  expect(instance).toMatchObject({ allowPrerelease: true, allowDowngrade: false })
  service.setUpdaterChannel('stable')
  const policy = (
    instance as EventEmitter & { isUpdateSupported: (info: { version: string }) => boolean }
  ).isUpdateSupported
  expect(policy({ version: '0.1.1-snapshot.1' })).toBe(false)
  expect(policy({ version: '0.1.0' })).toBe(true)
  expect(policy({ version: '0.0.9' })).toBe(false)
  expect(instance).toMatchObject({ allowPrerelease: false, allowDowngrade: false })
  instance.emit('update-available', {})
  service.setUpdaterChannel('snapshot')
  expect(service.getUpdaterStatus().state).toBe('idle')
  instance.emit('checking-for-update')
  expect(() => service.setUpdaterChannel('stable')).toThrow(expect.objectContaining({ code: expect.any(String) }))
  instance.emit('update-not-available')
  await expect(service.quitAndInstall()).rejects.toMatchObject({
    code: 'M029',
  })
  mock.check.mockRejectedValueOnce(new Error('check'))
  await expect(service.checkForUpdates()).rejects.toMatchObject({
    code: 'M027',
  })
  expect(mock.send.mock.calls.at(-1)?.[1]?.code).toBe('M027')
  mock.check.mockResolvedValueOnce(null)
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
  expect(() => service.setUpdaterChannel('stable')).toThrow(expect.objectContaining({ code: expect.any(String) }))
  expect(service.getUpdaterStatus().channel).toBe('snapshot')
  const cleanup = vi.fn<() => Promise<void>>(async () => {
    expect(mock.install).not.toHaveBeenCalled()
  })
  service.setBeforeUpdateInstall(cleanup)
  await service.quitAndInstall()
  expect(cleanup).toHaveBeenCalledOnce()
  expect(mock.install).toHaveBeenCalledOnce()
  expect(service.isInstallingUpdate()).toBe(true)
  instance.emit('error', new Error('install'))
  expect(mock.send.mock.calls.at(-1)?.[1]?.code).toBe('M029')
  expect(service.isInstallingUpdate()).toBe(false)
})
