import { afterEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  settings: { officialServicesEnabled: true, workshopEnabled: true, downloadDirectory: '' },
  init: vi.fn<
    (deps: import('../workshop/service').WorkshopDependencies) => Promise<{
      dispose: () => Promise<void>
      authenticationChanged: () => Promise<void>
    }>
  >(),
  dispose: vi.fn<() => Promise<void>>(async () => {}),
  authenticationChanged: vi.fn<() => Promise<void>>(async () => {}),
  snapshot: vi.fn<() => never>(() => {
    throw new Error('AUTH_NOT_INITIALIZED')
  }),
}))
vi.mock('electron', () => ({
  app: { isPackaged: false },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
}))
vi.mock('../workshop', () => ({ initWorkshopModule: mocks.init }))
vi.mock('../auth', () => ({
  getAuthSnapshot: mocks.snapshot,
  refreshAuthSession: vi.fn<() => void>(),
}))
vi.mock('../../stores/setting', () => ({
  settingRepository: { getSnapshot: () => mocks.settings },
}))
vi.mock('../../utils/application-data', () => ({
  getApplicationDataDirectory: () => process.cwd(),
}))
vi.mock('../../utils/ipc-source', () => ({ assertIpcSource: vi.fn<() => void>() }))
import { startWorkshop, stopWorkshop } from '../workshop-runtime'
import { notifyWorkshopAuthenticationChanged, setWorkshopEnabled } from '../workshop-lifecycle'
import type { WorkshopDependencies } from '../workshop/service'

afterEach(async () => {
  await stopWorkshop()
  setWorkshopEnabled(true)
  vi.clearAllMocks()
})

test.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])(
  'resident download runtime starts with official=%s and workshop=%s without reading auth',
  async (officialServicesEnabled, workshopEnabled) => {
    mocks.settings = { officialServicesEnabled, workshopEnabled, downloadDirectory: '' }
    mocks.init.mockResolvedValue({
      dispose: mocks.dispose,
      authenticationChanged: mocks.authenticationChanged,
    })
    await startWorkshop()
    await startWorkshop()
    expect(mocks.init).toHaveBeenCalledTimes(1)
    const deps = mocks.init.mock.calls[0][0] as WorkshopDependencies
    expect(deps.enabled()).toBe(officialServicesEnabled && workshopEnabled)
    expect(mocks.snapshot).not.toHaveBeenCalled()
    const changed = vi.fn<(enabled: boolean) => void>()
    const unsubscribe = deps.onEnabledChanged!(changed)
    setWorkshopEnabled(false)
    expect(changed).toHaveBeenLastCalledWith(false)
    unsubscribe()
    notifyWorkshopAuthenticationChanged()
    expect(mocks.authenticationChanged).toHaveBeenCalledTimes(1)
    await stopWorkshop()
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    notifyWorkshopAuthenticationChanged()
    expect(mocks.authenticationChanged).toHaveBeenCalledTimes(1)
  },
)
