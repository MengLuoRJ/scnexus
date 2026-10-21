import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  register: vi.fn<(channel: string, handler: (...args: unknown[]) => unknown) => void>(),
  remove: vi.fn<(channel: string) => void>(),
  source: vi.fn<(event: unknown) => void>(),
  windows: vi.fn<() => unknown[]>(() => []),
  load: vi.fn<() => string | null>(() => null),
  settings: vi.fn<() => { clientId: string }>(() => ({
    clientId: '7D6B0C48-40C8-4AE0-9197-95E41F11CCED',
  })),
  request: vi.fn<
    (operation: string, body: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>
  >(async () => {
    throw new Error('no network')
  }),
}))
vi.mock('electron', () => ({
  app: { getPath: () => 'unused' },
  BrowserWindow: { getAllWindows: mocks.windows },
  safeStorage: {},
}))
vi.mock('../../../utils/ipc-util', () => ({
  ipcHandleRegister: mocks.register,
  ipcHandleRemove: mocks.remove,
}))
vi.mock('../../../utils/ipc-source', () => ({ assertIpcSource: mocks.source }))
vi.mock('../storage', () => ({
  createAuthStorage: () => ({ load: mocks.load, clear: () => {}, save: () => {} }),
}))
vi.mock('../transport', () => ({
  createAuthTransport: () => ({ request: mocks.request }),
}))
vi.mock('../../../stores/setting', () => ({
  settingRepository: { getSnapshot: mocks.settings },
}))
import { disposeAuth, initAuthModule } from '../index'
afterEach(() => {
  disposeAuth()
  vi.clearAllMocks()
})
it('registers exactly the shared methods once and rejects excess arguments', () => {
  initAuthModule()
  initAuthModule()
  expect(mocks.register.mock.calls.map((call) => call[0])).toEqual([
    'auth:getSnapshot',
    'auth:login',
    'auth:register',
    'auth:completeMfa',
    'auth:requestChallenge',
    'auth:resetPassword',
    'auth:refresh',
    'auth:logout',
  ])
  const handler = mocks.register.mock.calls[0]![1]
  expect(handler()).toMatchObject({ status: 'signed-out', epoch: 0, version: 0 })
  expect(() => handler('extra')).toThrow('Invalid account input')
})
it('injects the existing setting repository installation ID', async () => {
  initAuthModule()
  const login = mocks.register.mock.calls.find(([channel]) => channel === 'auth:login')![1]
  await expect(
    login({ subject: 'test@example.com', password: 'legacy', deviceName: 'Desktop' }),
  ).rejects.toThrow('Account operation failed')
  expect(mocks.settings).toHaveBeenCalledOnce()
  expect(mocks.request).toHaveBeenCalledWith(
    'login',
    expect.objectContaining({ clientId: '7d6b0c48-40c8-4ae0-9197-95e41f11cced' }),
    expect.any(AbortSignal),
  )
})
it('does not throw startup storage errors and filters every broadcast by current source trust', () => {
  const trusted = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      mainFrame: {},
      send: vi.fn<(channel: string, data: unknown) => void>(),
    },
  }
  const untrusted = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      mainFrame: {},
      send: vi.fn<(channel: string, data: unknown) => void>(),
    },
  }
  mocks.windows.mockReturnValue([trusted, untrusted])
  mocks.source.mockImplementation((event) => {
    if ((event as { sender: unknown }).sender === untrusted.webContents)
      throw new Error('untrusted')
  })
  mocks.load.mockImplementationOnce(() => {
    throw new Error('secret storage error')
  })
  expect(() => initAuthModule()).not.toThrow()
  expect(trusted.webContents.send).toHaveBeenCalledWith(
    'auth:changed',
    expect.objectContaining({ status: 'signed-out' }),
  )
  expect(untrusted.webContents.send).not.toHaveBeenCalled()
})
