import { test, expect, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  data: vi.fn<(home: string, legacy: string) => void>(),
  configured: undefined as undefined | (() => Promise<void>),
  stores: vi.fn<() => Promise<void>>(async () => {}),
  content: vi.fn<typeof import('../content-package').initContentPackageModule>(),
  campaign: vi.fn<typeof import('../campaign').initCampaignModule>(),
  customize: vi.fn<typeof import('../customize').initCustomizeModule>(),
  setting: vi.fn<typeof import('../setting').initSettingModule>(),
}))
vi.mock('electron', () => ({ app: { getPath: (name: string) => `test-${name}` } }))
vi.mock('../../utils/application-data', () => ({ initializeApplicationData: mock.data }))
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
vi.mock('../content-package/validation.ipc', () => ({
  initArchiveValidationIpc: vi.fn<() => void>(),
}))
vi.mock('../campaign', () => ({ initCampaignModule: mock.campaign }))
vi.mock('../customize', () => ({ initCustomizeModule: mock.customize }))
vi.mock('../setting', () => ({
  initSettingModule: mock.setting,
  disposeSetting: vi.fn<typeof import('../setting').disposeSetting>(),
}))
vi.mock('../ai-assistant', () => ({
  initAiAssistantModule: vi.fn<() => void>(),
  disposeAiAssistant: vi.fn<() => Promise<void>>(async () => {}),
}))
vi.mock('../auth', () => ({
  initAuthModule: vi.fn<() => void>(),
  disposeAuth: vi.fn<() => void>(),
}))
vi.mock('../app', () => ({ initAppModule: vi.fn<typeof import('../app').initAppModule>() }))
vi.mock('../dialog', () => ({
  initDialogModule: vi.fn<typeof import('../dialog').initDialogModule>(),
}))
vi.mock('../shell', () => ({ initShellModule: vi.fn<typeof import('../shell').initShellModule>() }))
vi.mock('../deep-link', () => ({
  initDeepLinkModule: vi.fn<typeof import('../deep-link').initDeepLinkModule>(),
}))
vi.mock('../tray', () => ({
  initTrayModule: vi.fn<typeof import('../tray').initTrayModule>(),
  destroyTray: vi.fn<typeof import('../tray').destroyTray>(),
}))
vi.mock('../updater', () => ({
  initUpdaterModule: vi.fn<typeof import('../updater').initUpdaterModule>(),
  setBeforeUpdateInstall: vi.fn<typeof import('../updater').setBeforeUpdateInstall>(),
}))
vi.mock('../telemetry', () => ({
  initTelemetryModule: vi.fn<typeof import('../telemetry').initTelemetryModule>(),
  disableTelemetry: vi.fn<typeof import('../telemetry').disableTelemetry>(async () => {}),
  flushTelemetry: vi.fn<typeof import('../telemetry').flushTelemetry>(),
  getTelemetryStatus: vi.fn<typeof import('../telemetry').getTelemetryStatus>(),
}))
vi.mock('../window', () => ({
  initWindowModule: vi.fn<typeof import('../window').initWindowModule>(),
  onWindowReady: () => vi.fn<() => void>(),
  getMainWindow: () => null,
}))
vi.mock('../workshop-runtime', () => ({
  startWorkshop: async () => {},
  stopWorkshop: async () => {},
}))
vi.mock('../dependency/dependency.ipc', () => ({ initDependencyIpc: () => {} }))
vi.mock('../workshop', () => ({
  initWorkshopModule: vi.fn<typeof import('../workshop').initWorkshopModule>(),
}))
vi.mock('../logging', () => ({ reportError: (error: unknown) => error }))
import { initModules, disposeModules } from '../init'
import { flushTelemetry, disableTelemetry } from '../telemetry'
test('store failures defer content; later successful game initialization starts modules once', async () => {
  expect(await initModules()).toHaveLength(2)
  expect(mock.data).toHaveBeenCalledWith('test-home', 'test-userData')
  expect(mock.setting).not.toHaveBeenCalled()
  expect(mock.content).not.toHaveBeenCalled()
  mock.stores.mockRejectedValueOnce(new Error('content store'))
  await expect(mock.configured!()).rejects.toThrow('content store')
  expect(mock.content).not.toHaveBeenCalled()
  await mock.configured!()
  await mock.configured!()
  expect(mock.content).toHaveBeenCalledOnce()
  expect(mock.campaign).toHaveBeenCalledOnce()
  expect(mock.customize).toHaveBeenCalledOnce()
})
test('a migration failure prevents business initialization instead of using empty stores', async () => {
  vi.clearAllMocks()
  mock.data.mockImplementationOnce(() => {
    throw new Error('migration failed')
  })
  await expect(initModules()).rejects.toThrow('migration failed')
  expect(mock.stores).not.toHaveBeenCalled()
  expect(mock.content).not.toHaveBeenCalled()
  expect(mock.setting).not.toHaveBeenCalled()
})
test('normal disposal drains authorized telemetry before disabling the sending gate', async () => {
  vi.clearAllMocks()
  await disposeModules()
  expect(flushTelemetry).toHaveBeenCalledOnce()
  expect(disableTelemetry).toHaveBeenCalledOnce()
  expect(vi.mocked(flushTelemetry).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(disableTelemetry).mock.invocationCallOrder[0]!,
  )
})
