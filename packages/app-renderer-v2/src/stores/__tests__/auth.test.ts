import { beforeEach, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
import type { ApiAuth } from '../../apis/internal/client'
import { useAuthStore } from '../auth'

const mocks = vi.hoisted(() => ({
  get: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  login: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  logout: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refresh: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  me: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  authorization: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  stop: vi.fn<() => void>(),
  subscribe: vi.fn<() => void>(),
  listener: null as ((snapshot: AuthSnapshot) => void) | null,
}))
vi.mock('../../ipcs/auth', () => ({
  ipcAuthGetSnapshot: mocks.get,
  ipcAuthLogin: mocks.login,
  ipcAuthLogout: mocks.logout,
  ipcAuthRefresh: mocks.refresh,
  ipcAuthCompleteMfa: vi.fn<() => void>(),
  ipcAuthRegister: vi.fn<() => void>(),
  ipcAuthRequestChallenge: vi.fn<() => void>(),
  ipcAuthResetPassword: vi.fn<() => void>(),
  ipcAuthOnChanged: (listener: (snapshot: AuthSnapshot) => void) => {
    mocks.subscribe()
    mocks.listener = listener
    return mocks.stop
  },
}))
vi.mock('../../apis/account', () => ({
  apiUserMe: mocks.me,
  apiUserAuthorization: mocks.authorization,
}))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const ok = <T>(data: T) => ({ ok: true as const, data })
function state(status: AuthSnapshot['status'], epoch = 1, version = 1): AuthSnapshot {
  const signed = status === 'signed-in' || status === 'refreshing'
  return {
    status,
    epoch,
    version,
    accessToken: signed ? 'token' : null,
    accessExpiresAt: signed ? Date.now() + 60000 : null,
    sessionId: signed ? `session-${epoch}` : null,
    sessionExpiresAt: null,
    mfaExpiresAt: status === 'mfa-pending' ? Date.now() + 60000 : null,
  }
}
const profile = (epoch = 1) => ({
  id: `user-${epoch}`,
  sessionId: `session-${epoch}`,
  clientType: 'DESKTOP',
  twoFactorEnabled: false,
  nickname: 'Nexus_123',
  email: null,
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.listener = null
  setActivePinia(createPinia())
  Object.defineProperty(window, 'scnexus', { configurable: true, value: {} })
  mocks.get.mockResolvedValue(ok(state('signed-out', 0, 0)))
  mocks.me.mockResolvedValue(profile())
  mocks.authorization.mockResolvedValue({ roles: ['USER'], permissions: ['read'] })
  mocks.logout.mockResolvedValue(ok({ remoteRevoked: true }))
})
test('subscribes before initialization and ignores older epochs and same-epoch versions', async () => {
  const initial = deferred<unknown>()
  mocks.get.mockReturnValueOnce(initial.promise)
  const store = useAuthStore()
  const pending = store.initialize()
  expect(mocks.subscribe).toHaveBeenCalledOnce()
  mocks.listener?.(state('signed-in', 2, 5))
  initial.resolve(ok(state('signed-out', 0, 0)))
  await pending
  mocks.listener?.(state('signed-out', 1, 100))
  mocks.listener?.(state('signed-out', 2, 4))
  mocks.listener?.(state('signed-out', 2, 5))
  expect(store.snapshot).toMatchObject({ status: 'signed-in', epoch: 2, version: 5 })
  await store.initialize()
  expect(mocks.subscribe).toHaveBeenCalledOnce()
  store.dispose()
  expect(mocks.stop).toHaveBeenCalledOnce()
})
test.each(['resolve', 'reject'] as const)(
  'logout immediately clears projections and ignores late HTTP %s',
  async (outcome) => {
    const store = useAuthStore()
    await store.initialize()
    mocks.listener?.(state('signed-in'))
    await flushPromises()
    expect(store.user).toEqual(profile())
    expect(store.authorization?.roles).toEqual(['USER'])
    const late = deferred<unknown>()
    const revoke = deferred<unknown>()
    mocks.me.mockReturnValueOnce(late.promise)
    mocks.logout.mockReturnValueOnce(revoke.promise)
    const loading = store.loadAccount()
    const logout = store.logout()
    expect(store.signedIn).toBe(false)
    expect(store.snapshot.accessToken).toBeNull()
    expect(store.user).toBeNull()
    expect(store.authorization).toBeNull()
    expect(store.profileBusy).toBe(false)
    if (outcome === 'resolve') late.resolve(profile())
    else late.reject(new Error('late network error'))
    await loading
    expect(store.user).toBeNull()
    expect(store.profileError).toBeNull()
    mocks.listener?.(state('signed-in', 1, 99))
    expect(store.signedIn).toBe(false)
    mocks.get.mockResolvedValueOnce(ok(state('signed-out', 2, 1)))
    revoke.resolve(ok({ remoteRevoked: false }))
    await expect(logout).resolves.toEqual({ remoteRevoked: false })
    expect(store.snapshot.epoch).toBe(2)
  },
)
test('HTTP invalidation bypasses operation busy and blocks late operation restoration', async () => {
  const login = deferred<unknown>()
  const revoke = deferred<unknown>()
  mocks.login.mockReturnValueOnce(login.promise)
  mocks.logout.mockReturnValueOnce(revoke.promise)
  const store = useAuthStore()
  await store.initialize()
  const operation = store.login({ subject: 'a@b.com', password: 'secret', deviceName: 'desktop' })
  mocks.listener?.(state('signed-in'))
  await flushPromises()
  expect(store.busy).toBe(true)
  const auth = mocks.me.mock.calls[0]![0] as ApiAuth
  const invalidating = auth.invalidate!()
  expect(mocks.logout).toHaveBeenCalledOnce()
  expect(store.signedIn).toBe(false)
  expect(store.user).toBeNull()
  expect(store.authorization).toBeNull()
  login.resolve(ok(state('signed-in', 1, 2)))
  await operation
  expect(store.signedIn).toBe(false)
  mocks.get.mockResolvedValueOnce(ok(state('signed-out', 2, 1)))
  revoke.resolve(ok({ remoteRevoked: true }))
  await invalidating
  expect(store.snapshot.status).toBe('signed-out')
})
test('an old HTTP auth cannot invalidate a newer account', async () => {
  const store = useAuthStore()
  await store.initialize()
  mocks.listener?.(state('signed-in'))
  await flushPromises()
  const oldAuth = mocks.me.mock.calls[0]![0] as ApiAuth
  mocks.me.mockResolvedValueOnce(profile(2))
  mocks.listener?.(state('signed-in', 2))
  await flushPromises()
  await oldAuth.invalidate!()
  expect(mocks.logout).not.toHaveBeenCalled()
  expect(store.signedIn).toBe(true)
  expect(store.user?.id).toBe('user-2')
})
test('MFA pending has no account projection or HTTP calls', async () => {
  const store = useAuthStore()
  await store.initialize()
  mocks.login.mockResolvedValueOnce(ok(state('mfa-pending')))
  await store.login({ subject: 'a@b.com', password: 'secret', deviceName: 'desktop' })
  expect(store.signedIn).toBe(false)
  expect(store.snapshot.status).toBe('mfa-pending')
  expect(store.snapshot.accessToken).toBeNull()
  expect(mocks.me).not.toHaveBeenCalled()
  expect(mocks.authorization).not.toHaveBeenCalled()
})
