import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../../stores/auth'
import { challengeState, validateAccount } from '../form'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
const mocks = vi.hoisted(() => ({
  get: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  login: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  register: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  mfa: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  challenge: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  reset: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refresh: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  logout: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listener: null as null | ((value: AuthSnapshot) => void),
  stop: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  me: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  permissions: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('../../../ipcs/auth', () => ({
  ipcAuthGetSnapshot: mocks.get,
  ipcAuthLogin: mocks.login,
  ipcAuthRegister: mocks.register,
  ipcAuthCompleteMfa: mocks.mfa,
  ipcAuthRequestChallenge: mocks.challenge,
  ipcAuthResetPassword: mocks.reset,
  ipcAuthRefresh: mocks.refresh,
  ipcAuthLogout: mocks.logout,
  ipcAuthOnChanged: (listener: (value: AuthSnapshot) => void) => {
    mocks.listener = listener
    return mocks.stop
  },
}))
vi.mock('../../../apis/account', () => ({
  apiUserMe: mocks.me,
  apiUserAuthorization: mocks.permissions,
}))
const state = (status: AuthSnapshot['status'], epoch = 1, version = 1): AuthSnapshot => ({
  status,
  epoch,
  version,
  accessToken: status === 'signed-in' ? 'memory-only' : null,
  sessionId: status === 'signed-in' ? 'session' : null,
  accessExpiresAt: Date.now() + 10000,
  sessionExpiresAt: null,
  mfaExpiresAt: status === 'mfa-pending' ? Date.now() + 60000 : null,
})
const ok = <T>(data: T) => ({ ok: true, data })
beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  Object.defineProperty(window, 'scnexus', { configurable: true, value: {} })
  mocks.get.mockResolvedValue(ok(state('signed-out', 0, 0)))
  mocks.me.mockResolvedValue({
    id: 'user',
    sessionId: 'session',
    clientType: 'DESKTOP',
    twoFactorEnabled: false,
    nickname: 'Nexus_123',
    email: null,
  })
  mocks.permissions.mockResolvedValue({ roles: ['USER'], permissions: [] })
})
it('keeps local pages working without a desktop bridge', async () => {
  Object.defineProperty(window, 'scnexus', { configurable: true, value: undefined })
  const store = useAuthStore()
  await store.initialize()
  expect(store.signedIn).toBe(false)
  expect(mocks.get).not.toHaveBeenCalled()
})
it('does not treat MFA/2xx as login and only passes the selected factor', async () => {
  const store = useAuthStore()
  await store.initialize()
  mocks.login.mockResolvedValue(ok(state('mfa-pending', 1, 1)))
  await store.login({ subject: 'a@b.com', password: 'p', deviceName: 'desktop' })
  expect(store.signedIn).toBe(false)
  expect(store.snapshot.accessToken).toBeNull()
  mocks.mfa.mockResolvedValue(ok(state('signed-in', 1, 2)))
  await store.completeMfa({ code: '012345' })
  expect(mocks.mfa).toHaveBeenCalledWith({ code: '012345' })
  expect(store.signedIn).toBe(true)
})
it('secure storage errors never mark the renderer signed in', async () => {
  const store = useAuthStore()
  mocks.login.mockResolvedValue({ ok: false, error: {} })
  await expect(
    store.login({ subject: 'a@b.com', password: 'p', deviceName: 'd' }),
  ).rejects.toMatchObject({ kind: 'desktop' })
  expect(store.signedIn).toBe(false)
})
it('orders event/snapshot races and clears projections at logout epoch', async () => {
  const store = useAuthStore()
  mocks.get.mockImplementationOnce(async () => {
    mocks.listener?.(state('signed-in', 2, 5))
    return ok(state('signed-out', 0, 0))
  })
  await store.initialize()
  await vi.waitFor(() => expect(store.user?.id).toBe('user'))
  mocks.listener?.(state('signed-out', 3, 6))
  expect(store.user).toBeNull()
  expect(store.authorization).toBeNull()
  mocks.listener?.(state('signed-in', 2, 7))
  expect(store.signedIn).toBe(false)
  store.dispose()
  expect(mocks.stop).toHaveBeenCalledOnce()
})
it('drops old in-flight profile results after epoch changes', async () => {
  let resolve!: (value: unknown) => void
  mocks.me.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const store = useAuthStore()
  await store.initialize()
  mocks.listener?.(state('signed-in', 1, 1))
  mocks.listener?.(state('signed-out', 2, 2))
  resolve({ id: 'old-user', sessionId: 'session' })
  await Promise.resolve()
  await Promise.resolve()
  expect(store.user).toBeNull()
  expect(store.authorization).toBeNull()
})
it('reports remote revoke failure while syncing local signout', async () => {
  const store = useAuthStore()
  await store.initialize()
  mocks.listener?.(state('signed-in', 1, 1))
  mocks.logout.mockResolvedValue(ok({ remoteRevoked: false }))
  mocks.get.mockResolvedValue(ok(state('signed-out', 2, 2)))
  await expect(store.logout()).resolves.toEqual({ remoteRevoked: false })
  expect(store.signedIn).toBe(false)
})
it('pairs challenge and leading-zero proof; honors cooldown and expiry', () => {
  const challenge = challengeState(
    {
      accepted: true,
      challengeId: 'aabbccdd-1234-4567-8901-aabbccddeeff',
      expiresIn: 600,
      retryAfter: 60,
    },
    'a@b.com',
    'REGISTER',
    1000,
  )
  const fields = {
    subject: 'a@b.com',
    password: 'StrongPass1!',
    deviceName: 'd',
    proof: '012345',
    invitationCode: '',
  }
  expect(validateAccount(fields, 'register', false, challenge, 1000)).toEqual([])
  expect(fields.proof).toBe('012345')
  expect(challenge.retryAt).toBe(61000)
  expect(
    validateAccount({ ...fields, subject: 'other@b.com' }, 'register', false, challenge, 1000),
  ).toContainEqual(expect.objectContaining({ name: 'challenge' }))
  expect(validateAccount(fields, 'reset', false, challenge, 1000)).toContainEqual(
    expect.objectContaining({ name: 'challenge' }),
  )
  expect(validateAccount(fields, 'register', false, challenge, 601000)).toContainEqual(
    expect.objectContaining({ name: 'challenge' }),
  )
})
it('validates optional provided invitations without trimming and finite field bounds', () => {
  const fields = {
    subject: 'a@b.com',
    password: 'StrongPass1!',
    deviceName: 'd',
    proof: '012345',
    invitationCode: ' invalid ',
  }
  expect(validateAccount(fields, 'register', false, null, 0)).toContainEqual(
    expect.objectContaining({ name: 'invitationCode' }),
  )
  expect(
    validateAccount(
      { ...fields, password: '', deviceName: 'a'.repeat(81) },
      'login',
      false,
      null,
      0,
    ).map((e) => e.name),
  ).toEqual(['password', 'deviceName'])
})

it.each(['Abc123!x', 'LongPass2026@'])('accepts a strong new password %s', (password) => {
  const fields = {
    subject: 'a@b.com',
    password,
    deviceName: 'PC',
    proof: '012345',
    invitationCode: '',
  }
  expect(
    validateAccount(fields, 'register', false, null, 0).filter(
      (error) => error.name === 'password',
    ),
  ).toEqual([])
})
it.each(['Abc12!x', 'abcdefgh1!', 'ABCDEFGH1!', 'Abcdefgh!', 'Abcdefg1 ', 'Abcdefg1中'])(
  'rejects weak new passwords but permits legacy login input: %s',
  (password) => {
    const fields = {
      subject: 'a@b.com',
      password,
      deviceName: 'PC',
      proof: '012345',
      invitationCode: '',
    }
    expect(validateAccount(fields, 'register', false, null, 0)).toContainEqual(
      expect.objectContaining({ name: 'password' }),
    )
    expect(validateAccount(fields, 'login', false, null, 0)).toEqual([])
  },
)
