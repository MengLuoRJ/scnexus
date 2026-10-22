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
const analytics = vi.hoisted(() => ({
  start: vi.fn<(snapshot: unknown) => void>(),
  login: vi.fn<(snapshot: unknown) => void>(),
  logout: vi.fn<() => void>(),
  dispose: vi.fn<() => void>(),
}))
vi.mock('../../analytics-lifecycle', () => ({
  analyticsAuthenticationChanged: vi.fn<(snapshot: unknown) => void>(),
  startAnalytics: analytics.start,
  analyticsLogin: analytics.login,
  analyticsLogout: analytics.logout,
  disposeAnalytics: analytics.dispose,
}))
import { disposeAuth, initAuthModule } from '../index'
afterEach(() => {
  disposeAuth()
  vi.clearAllMocks()
})
it('registers exactly the shared methods once and rejects excess arguments', async () => {
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
  expect(await handler()).toMatchObject({ status: 'signed-out', epoch: 0, version: 0 })
  await expect(handler('extra')).rejects.toThrow('Invalid account input')
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

it('triggers statistics only after successful login and completed logout, not snapshot or refresh', async () => {
  initAuthModule()
  await Promise.resolve()
  await Promise.resolve()
  const handler = (channel: string) =>
    mocks.register.mock.calls.find(([name]) => name === channel)![1]
  const pair = {
    accessToken: 'access.payload.signature',
    refreshToken: 'a'.repeat(43),
    expiresIn: 600,
    sessionId: '7d6b0c48-40c8-4ae0-9197-95e41f11cced',
    sessionExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  }
  mocks.request.mockResolvedValueOnce(pair)
  await handler('auth:login')({
    subject: 'user@example.test',
    password: 'password',
    deviceName: 'PC',
  })
  expect(analytics.login).toHaveBeenCalledOnce()
  await handler('auth:getSnapshot')()
  await handler('auth:refresh')()
  expect(analytics.login).toHaveBeenCalledOnce()
  mocks.request.mockResolvedValueOnce({ success: true })
  await handler('auth:logout')()
  expect(analytics.logout).toHaveBeenCalledOnce()
  expect(analytics.start).toHaveBeenCalledOnce()
})
