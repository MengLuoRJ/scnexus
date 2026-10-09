import { test, expect, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  configured: undefined as undefined | (() => Promise<void>),
  stores: vi.fn(async () => {}),
  content: vi.fn(),
  campaign: vi.fn(),
  customize: vi.fn(),
  setting: vi.fn(),
}))
vi.mock('../../stores', () => ({
  initAllStores: async () => {
    throw new Error('store failure')
  },
  initContentStores: mock.stores,
}))
vi.mock('../../stores/setting', () => ({
  settingRepository: { isInitialized: () => false },
}))
vi.mock('../scii-game-setting', () => ({
  onGameConfigured: (fn: () => Promise<void>) => (mock.configured = fn),
  initSciiGameSettingModule: async () => {
    throw new Error('game missing')
  },
}))
vi.mock('../content-package', () => ({
  initContentPackageModule: mock.content,
}))
vi.mock('../campaign', () => ({ initCampaignModule: mock.campaign }))
vi.mock('../customize', () => ({ initCustomizeModule: mock.customize }))
vi.mock('../setting', () => ({
  initSettingModule: mock.setting,
  disposeSetting: vi.fn(),
}))
vi.mock('../app', () => ({ initAppModule: vi.fn() }))
vi.mock('../dialog', () => ({ initDialogModule: vi.fn() }))
vi.mock('../shell', () => ({ initShellModule: vi.fn() }))
vi.mock('../deep-link', () => ({ initDeepLinkModule: vi.fn() }))
vi.mock('../tray', () => ({ initTrayModule: vi.fn(), destroyTray: vi.fn() }))
vi.mock('../updater', () => ({
  initUpdaterModule: vi.fn(),
  setBeforeUpdateInstall: vi.fn(),
}))
vi.mock('../telemetry', () => ({
  initTelemetryModule: vi.fn(),
  disableTelemetry: vi.fn(),
  getTelemetryStatus: vi.fn(),
}))
vi.mock('../window', () => ({
  initWindowModule: vi.fn(),
  onWindowReady: () => vi.fn(),
  getMainWindow: () => null,
}))
vi.mock('../workshop', () => ({ initWorkshopModule: vi.fn() }))
vi.mock('../logging', () => ({ reportError: (error: unknown) => error }))
import { initModules } from '../init'
test('store failures defer content; later successful game initialization starts modules once', async () => {
  expect(await initModules()).toHaveLength(2)
  expect(mock.setting).not.toHaveBeenCalled()
  expect(mock.content).not.toHaveBeenCalled()
  mock.stores.mockRejectedValueOnce(new Error('content store'))
  await expect(mock.configured!()).rejects.toThrow()
  expect(mock.content).not.toHaveBeenCalled()
  await mock.configured!()
  await mock.configured!()
  expect(mock.content).toHaveBeenCalledOnce()
  expect(mock.campaign).toHaveBeenCalledOnce()
  expect(mock.customize).toHaveBeenCalledOnce()
})
