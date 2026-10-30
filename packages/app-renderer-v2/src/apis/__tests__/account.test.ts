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
import {
  apiRegistrationPolicy,
  apiUserMe,
  apiUserAuthorization,
  apiTwoFactorEnroll,
  apiTwoFactorConfirm,
  apiTwoFactorStatus,
  apiTwoFactorRegenerate,
  apiTwoFactorVerify,
  apiTwoFactorDisable,
  apiTwoFactorRotate,
} from '../account'
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
  it('verifies a session without replaying rejected factors and validates the lifetime', async () => {
    const auth = { getSnapshot: snapshot, refresh: vi.fn(), invalidate: vi.fn() }
    mocks.request.mockResolvedValueOnce({ data: { verified: true, expiresIn: 300 } })
    await expect(apiTwoFactorVerify(auth, { code: '012345' })).resolves.toBe(300)
    mocks.request.mockResolvedValueOnce({ data: { verified: true, expiresIn: 999999 } })
    await expect(apiTwoFactorVerify(auth, { code: '012345' })).rejects.toMatchObject({
      kind: 'invalidResponse',
    })
    mocks.request.mockRejectedValueOnce(responseError(401))
    await expect(apiTwoFactorVerify(auth, { recoveryCode: 'a'.repeat(32) })).rejects.toMatchObject({
      kind: 'unauthorized',
    })
    expect(auth.invalidate).not.toHaveBeenCalled()
    expect(auth.refresh).not.toHaveBeenCalled()
  })
  it('reads authoritative MFA status and remaining recovery codes', async () => {
    const auth = { getSnapshot: snapshot, refresh: vi.fn() }
    mocks.request.mockResolvedValueOnce({
      data: {
        twoFactorEnabled: true,
        twoFactorVerified: false,
        twoFactorVerifiedAt: null,
        recoveryCodesRemaining: 4,
      },
    })
    await expect(apiTwoFactorStatus(auth)).resolves.toMatchObject({ recoveryCodesRemaining: 4 })
    expect(mocks.request.mock.calls[0]?.[0]).toMatchObject({
      method: 'GET',
      url: '/auth/two-factor',
    })
    mocks.request.mockResolvedValueOnce({
      data: {
        twoFactorEnabled: true,
        twoFactorVerified: true,
        twoFactorVerifiedAt: 'invalid',
        recoveryCodesRemaining: -1,
      },
    })
    await expect(apiTwoFactorStatus(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
  })
  it('regenerates recovery codes and rejects duplicate codes', async () => {
    const auth = { getSnapshot: snapshot, refresh: vi.fn(), invalidate: vi.fn() }
    mocks.request.mockResolvedValueOnce({
      data: { recoveryCodes: ['a'.repeat(32), 'b'.repeat(32)] },
    })
    await expect(apiTwoFactorRegenerate(auth, { code: '012345' })).resolves.toHaveLength(2)
    expect(mocks.request.mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      url: '/auth/two-factor/recovery-codes',
      data: { code: '012345' },
    })
    mocks.request.mockResolvedValueOnce({
      data: { recoveryCodes: ['a'.repeat(32), 'A'.repeat(32)] },
    })
    await expect(
      apiTwoFactorRegenerate(auth, { recoveryCode: 'a'.repeat(32) }),
    ).rejects.toMatchObject({ kind: 'invalidResponse' })
    mocks.request.mockRejectedValueOnce(responseError(401))
    await expect(apiTwoFactorRegenerate(auth, { code: '012345' })).rejects.toMatchObject({
      kind: 'unauthorized',
    })
    expect(auth.invalidate).not.toHaveBeenCalled()
    expect(auth.refresh).not.toHaveBeenCalled()
  })
  it('rotates with a recovery code and validates the replacement enrollment', async () => {
    const auth = { getSnapshot: snapshot, refresh: vi.fn() }
    mocks.request.mockResolvedValueOnce({
      data: {
        secret: 'ABCDEFG2',
        otpauthUri: 'otpauth://totp/SCNexus?secret=ABCDEFG2',
        expiresIn: 600,
      },
    })
    await expect(apiTwoFactorRotate(auth, { recoveryCode: 'a'.repeat(32) })).resolves.toMatchObject(
      { secret: 'ABCDEFG2' },
    )
    expect(mocks.request.mock.calls[0]?.[0]).toMatchObject({
      url: '/auth/two-factor/rotate',
      method: 'POST',
      data: { recoveryCode: 'a'.repeat(32) },
    })
  })
  it('validates disable requires reauthentication', async () => {
    const auth = { getSnapshot: snapshot, refresh: vi.fn() }
    mocks.request.mockResolvedValueOnce({
      data: { twoFactorEnabled: false, reauthenticationRequired: true },
    })
    await expect(apiTwoFactorDisable(auth, { code: '012345' })).resolves.toBeUndefined()
    expect(mocks.request.mock.calls[0]?.[0].data).toEqual({ code: '012345' })
    mocks.request.mockResolvedValueOnce({ data: { twoFactorEnabled: false } })
    await expect(apiTwoFactorDisable(auth, { code: '012345' })).rejects.toMatchObject({
      kind: 'invalidResponse',
    })
  })
  it.each([apiTwoFactorRotate, apiTwoFactorDisable])(
    'rejects ambiguous factors and preserves sessions on rejected proofs',
    async (operation) => {
      const auth = { getSnapshot: snapshot, refresh: vi.fn(), invalidate: vi.fn() }
      await expect(
        operation(auth, { code: '012345', recoveryCode: 'a'.repeat(32) } as never),
      ).rejects.toMatchObject({ kind: 'badRequest' })
      expect(mocks.request).not.toHaveBeenCalled()
      mocks.request.mockRejectedValueOnce(responseError(401))
      await expect(operation(auth, { code: '012345' })).rejects.toMatchObject({
        kind: 'unauthorized',
      })
      expect(auth.refresh).not.toHaveBeenCalled()
      expect(auth.invalidate).not.toHaveBeenCalled()
      expect(mocks.request).toHaveBeenCalledOnce()
    },
  )
  it('validates enrollment and submits the exact six-digit code', async () => {
    const auth = { getSnapshot: snapshot, refresh: vi.fn() }
    mocks.request.mockResolvedValueOnce({
      data: {
        secret: 'ABCDEFG2',
        otpauthUri: 'otpauth://totp/SCNexus?secret=ABCDEFG2',
        expiresIn: 600,
      },
    })
    await expect(apiTwoFactorEnroll(auth)).resolves.toMatchObject({ secret: 'ABCDEFG2' })
    mocks.request.mockResolvedValueOnce({
      data: { twoFactorEnabled: true, recoveryCodes: ['a'.repeat(32)] },
    })
    await expect(apiTwoFactorConfirm(auth, '012345')).resolves.toEqual(['a'.repeat(32)])
    expect(mocks.request.mock.calls[1]?.[0]).toMatchObject({
      method: 'POST',
      data: { code: '012345' },
    })
  })
  it('does not sign out or replay when enrollment confirmation rejects a code', async () => {
    const auth = { getSnapshot: snapshot, refresh: vi.fn(), invalidate: vi.fn() }
    mocks.request.mockRejectedValueOnce(responseError(401))
    await expect(apiTwoFactorConfirm(auth, '012345')).rejects.toMatchObject({
      kind: 'unauthorized',
    })
    expect(auth.invalidate).not.toHaveBeenCalled()
    expect(auth.refresh).not.toHaveBeenCalled()
    expect(mocks.request).toHaveBeenCalledOnce()
  })
  it('rejects malformed enrollment and invalid input without sending a code', async () => {
    const auth = { getSnapshot: snapshot, refresh: vi.fn() }
    await expect(apiTwoFactorConfirm(auth, '123')).rejects.toMatchObject({ kind: 'badRequest' })
    expect(mocks.request).not.toHaveBeenCalled()
    mocks.request.mockResolvedValueOnce({
      data: { secret: 'ABCDEFG2', otpauthUri: 'https://example.com', expiresIn: 600 },
    })
    await expect(apiTwoFactorEnroll(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
  })
  it('rejects a successful confirmation without valid one-time recovery codes', async () => {
    const auth = { getSnapshot: snapshot, refresh: vi.fn() }
    mocks.request.mockResolvedValueOnce({ data: { twoFactorEnabled: true, recoveryCodes: [] } })
    await expect(apiTwoFactorConfirm(auth, '012345')).rejects.toMatchObject({
      kind: 'invalidResponse',
    })
  })
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
    const refresh = vi.fn<() => Promise<void>>(async () => { })
    const invalidate = vi.fn<() => Promise<void>>(async () => { })
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
    const refresh = vi.fn<() => Promise<void>>(async () => { })
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
