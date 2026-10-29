import type { AxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  request: vi.fn<(config: AxiosRequestConfig) => Promise<{ data: unknown }>>(),
  createConfig: undefined as unknown,
  create: vi.fn<(config: unknown) => void>(),
}))
vi.mock('axios', () => ({
  default: {
    create: (config: unknown) => {
      mocks.createConfig = config
      mocks.create(config)
      return { request: mocks.request }
    },
    isAxiosError: (value: unknown) =>
      Boolean(value && typeof value === 'object' && 'isAxiosError' in value),
  },
}))
import { apiRequest, AccountError } from '../internal/client'
import { apiRegistrationPolicy, apiUserMe, apiUserAuthorization } from '../account'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
const snapshot = (): AuthSnapshot => ({
  status: 'signed-in',
  epoch: 1,
  version: 1,
  sessionId: 'bbaafbf1-e0ac-4a35-8843-3e0b5ca45d36',
  accessToken: 'memory-token',
  accessExpiresAt: Date.now() + 10000,
  sessionExpiresAt: null,
  mfaExpiresAt: null,
})
const responseError = (status: number) => ({
  isAxiosError: true,
  response: { status, data: { secret: 'must not leak' } },
  config: { secret: 'must not leak' },
})
beforeEach(() => {
  mocks.request.mockReset()
})
describe('account HTTP boundary', () => {
  it('uses the fixed base and never cookies', () => {
    expect(mocks.createConfig).toEqual(
      expect.objectContaining({
        baseURL: 'http://127.0.0.1:3000',
        withCredentials: false,
        adapter: 'fetch',
        fetchOptions: { redirect: 'error', credentials: 'omit', cache: 'no-store' },
      }),
    )
  })
  it('refreshes GET401 at most once with a fresh Bearer', async () => {
    const state = snapshot()
    const refresh = vi.fn<() => Promise<void>>(async () => {
      state.accessToken = 'new-token'
    })
    mocks.request.mockRejectedValueOnce(responseError(401)).mockResolvedValueOnce({ data: true })
    await expect(
      apiRequest('/users/me', Boolean, { getSnapshot: () => state, refresh }),
    ).resolves.toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(mocks.request.mock.calls[1]?.[0].headers?.Authorization).toBe('Bearer new-token')
    expect(mocks.request.mock.calls[0]?.[0].withCredentials).toBe(false)
  })
  it('invalidates a rejected session after one GET recovery without another replay', async () => {
    const refresh = vi.fn<() => Promise<void>>(async () => {})
    const invalidate = vi.fn<() => Promise<void>>(async () => {})
    mocks.request.mockRejectedValue(responseError(401))
    await expect(
      apiRequest('/users/me', Boolean, { getSnapshot: snapshot, refresh, invalidate }),
    ).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(refresh).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledOnce()
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('never replays %s401', async (method) => {
    const refresh = vi.fn<() => Promise<void>>()
    mocks.request.mockRejectedValue(responseError(401))
    await expect(
      apiRequest('/users/me', Boolean, { getSnapshot: snapshot, refresh }, method),
    ).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(refresh).not.toHaveBeenCalled()
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it.each([400, 403, 429, 503])('sanitizes HTTP%s without refreshing', async (status) => {
    const refresh = vi.fn<() => Promise<void>>()
    mocks.request.mockRejectedValue(responseError(status))
    const error = await apiRequest('/users/me', Boolean, { getSnapshot: snapshot, refresh }).catch(
      (e) => e,
    )
    expect(error).toBeInstanceOf(AccountError)
    expect(JSON.stringify(error)).not.toContain('must not leak')
    expect(error.config).toBeUndefined()
    expect(refresh).not.toHaveBeenCalled()
  })
  it('does not refresh twice on repeated 401', async () => {
    const refresh = vi.fn<() => Promise<void>>(async () => {})
    mocks.request.mockRejectedValue(responseError(401))
    await expect(
      apiRequest('/users/me', Boolean, { getSnapshot: snapshot, refresh }),
    ).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })
  it.each([
    'https://evil.example/path',
    '//evil.example/path',
    '/\\evil.example',
    '/users/../auth',
    '/users/%2fme',
  ])('rejects unsafe target %s before transport', async (path) => {
    await expect(apiRequest(path, Boolean)).rejects.toMatchObject({ kind: 'badRequest' })
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('drops a response after logout/account epoch change', async () => {
    const state = snapshot()
    mocks.request.mockImplementation(async () => {
      state.epoch++
      return { data: true }
    })
    await expect(
      apiRequest('/users/me', Boolean, {
        getSnapshot: () => state,
        refresh: vi.fn<() => Promise<void>>(),
      }),
    ).rejects.toMatchObject({ kind: 'stale' })
  })
  it('validates modeled policy and documented user/authorization projections', async () => {
    mocks.request.mockResolvedValueOnce({ data: { invitationRequired: false } })
    await expect(apiRegistrationPolicy()).resolves.toEqual({ invitationRequired: false })
    mocks.request.mockResolvedValueOnce({ data: { invitationRequired: 'false' } })
    await expect(apiRegistrationPolicy()).rejects.toMatchObject({ kind: 'invalidResponse' })
    const auth = {
      getSnapshot: snapshot,
      refresh: vi.fn<() => Promise<void>>(),
    }
    mocks.request.mockResolvedValueOnce({
      data: {
        id: 'ceeb700c-a097-410d-a388-62fa81bb9969',
        sessionId: snapshot().sessionId,
        clientType: 'DESKTOP',
        twoFactorEnabled: false,
        nickname: 'Nexus_123',
        email: null,
        token: 'discard',
      },
    })
    const user = await apiUserMe(auth)
    expect(user).not.toHaveProperty('token')
    mocks.request.mockResolvedValueOnce({ data: { roles: [], permissions: [] } })
    await expect(apiUserAuthorization(auth)).resolves.toEqual({ roles: [], permissions: [] })
    mocks.request.mockResolvedValueOnce({ data: { roles: ['USER'], permissions: [1] } })
    await expect(apiUserAuthorization(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
  })
})
