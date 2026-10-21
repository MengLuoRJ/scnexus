import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthService } from '../service'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
import type { AuthOperation } from '../transport'
const id = '7d6b0c48-40c8-4ae0-9197-95e41f11cced'
const input = { subject: 'test@example.com', password: 'password', deviceName: 'Desktop' }
function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (value: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function setup(getClientId?: () => string) {
  let now = Date.now()
  const sessionExpiresAt = new Date(now + 86400000).toISOString()
  let disk: string | null = null
  const pair = (token = 'a') => ({
    accessToken: `${token}.payload.signature`,
    refreshToken: token.repeat(43),
    expiresIn: 600,
    sessionId: id,
    sessionExpiresAt,
  })
  const request = vi
    .fn<
      (
        operation: AuthOperation,
        body: Record<string, unknown>,
        signal: AbortSignal,
        access?: string,
      ) => Promise<unknown>
    >()
    .mockImplementation(async () => pair())
  const storage = {
    load: vi.fn<() => string | null>(() => disk),
    save: vi.fn<(value: string) => void>((value: string) => {
      disk = value
    }),
    clear: vi.fn<() => void>(() => {
      disk = null
    }),
  }
  const events: AuthSnapshot[] = []
  const service = createAuthService({
    storage,
    transport: { request },
    now: () => now,
    getClientId,
    changed: (value) => events.push(value),
  })
  services.push(service)
  return {
    service,
    storage,
    request,
    events,
    pair,
    advance: () => {
      now += 601000
    },
    disk: () => disk,
  }
}
const services: ReturnType<typeof createAuthService>[] = []
afterEach(() => {
  services.splice(0).forEach((service) => service.dispose())
  vi.useRealTimers()
})
describe('desktop account service', () => {
  it('uses the installation client ID for login/register, not MFA/refresh', async () => {
    let installationId = id.toUpperCase()
    const { service, request, pair, advance } = setup(() => installationId)
    request.mockResolvedValueOnce({ mfaRequired: true, challengeId: id, expiresIn: 300 })
    await service.login(input)
    expect(request.mock.calls[0]?.[1]).toMatchObject({ clientId: id })
    request.mockResolvedValueOnce({ ...pair(), clientId: id })
    expect((await service.completeMfa({ code: '012345' })).clientId).toBe(id)
    expect(request.mock.calls[1]?.[1]).not.toHaveProperty('clientId')
    installationId = 'a'.repeat(8) + '-aaaa-4aaa-8aaa-' + 'a'.repeat(12)
    advance()
    request.mockResolvedValueOnce({ ...pair('b'), clientId: id })
    expect((await service.refresh()).clientId).toBe(id)
    expect(request.mock.calls[2]?.[1]).not.toHaveProperty('clientId')
    await service.register({ ...input, password: 'Strong1!', challengeId: id, proof: '012345' })
    expect(request.mock.calls[3]?.[1]).toMatchObject({ clientId: installationId })
    await service.logout()
    expect(service.getSnapshot().clientId).toBeNull()
  })
  it.each(['', 'not-a-uuid', id.replace('-4ae0-', '-1ae0-'), ` ${id}`])(
    'rejects invalid installation ID %j without network dispatch',
    async (clientId) => {
      const { service, request } = setup(() => clientId)
      await expect(service.login(input)).rejects.toThrow('Account operation failed')
      expect(request).not.toHaveBeenCalled()
    },
  )
  it('rejects client IDs supplied by the renderer', async () => {
    const { service, request } = setup(() => id)
    await expect(service.login({ ...input, clientId: id })).rejects.toThrow('Invalid account input')
    await expect(
      service.register({
        ...input,
        password: 'Strong1!',
        challengeId: id,
        proof: '012345',
        clientId: id,
      }),
    ).rejects.toThrow('Invalid account input')
    expect(request).not.toHaveBeenCalled()
  })
  it.each([null, id, undefined])('accepts compatible response clientId %j', async (clientId) => {
    const { service, request, pair } = setup()
    request.mockResolvedValueOnce({ ...pair(), ...(clientId === undefined ? {} : { clientId }) })
    expect((await service.login(input)).clientId).toBe(clientId ?? null)
  })
  it.each([123, {}, [], false, undefined, '', 'not-a-uuid', id.replace('-4ae0-', '-1ae0-')])(
    'rejects invalid response clientId %j',
    async (clientId) => {
      const { service, request, pair, storage } = setup()
      request.mockResolvedValueOnce({ ...pair(), clientId })
      await expect(service.login(input)).rejects.toThrow('Account operation failed')
      expect(storage.save).not.toHaveBeenCalled()
    },
  )
  it.each(['password', 'Strong12', 'Strong1 ', 'Strong1中', 'Aa1!xxx', 'Aa1!'.padEnd(129, 'x')])(
    'rejects weak reset passwords %j without dispatch',
    async (password) => {
      const { service, request } = setup()
      await expect(
        service.resetPassword({ challengeId: id, proof: '012345', password }),
      ).rejects.toThrow('Invalid account input')
      expect(request).not.toHaveBeenCalled()
    },
  )
  it('submits strong reset passwords without trimming', async () => {
    const { service, request } = setup()
    const reset = { challengeId: id, proof: '012345', password: ' Aa1!xx ' }
    request.mockResolvedValueOnce({ success: true })
    await service.resetPassword(reset)
    expect(request.mock.calls[0]?.[1]).toEqual(reset)
  })
  it('supports registration with invitation code and recovery-code MFA', async () => {
    const { service, request } = setup()
    await service.register({
      ...input,
      password: 'Strong1!',
      challengeId: id,
      proof: '012345',
      invitationCode: 'Invite_123',
    })
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      provider: 'EMAIL',
      clientType: 'DESKTOP',
      invitationCode: 'Invite_123',
    })
    request.mockResolvedValueOnce({ mfaRequired: true, challengeId: id, expiresIn: 300 })
    await service.login(input)
    await service.completeMfa({ recoveryCode: 'a'.repeat(32) })
    expect(request.mock.calls.at(-1)?.[1]).toEqual({
      challengeId: id,
      clientType: 'DESKTOP',
      recoveryCode: 'a'.repeat(32),
    })
  })
  it('fails closed on rotated-credential save failure', async () => {
    const { service, storage, request, pair, advance, events, disk } = setup()
    await service.login(input)
    advance()
    request.mockResolvedValueOnce(pair('b'))
    storage.save.mockImplementationOnce(() => {
      throw new Error('secret')
    })
    await expect(service.refresh()).rejects.toThrow('Account operation failed')
    expect(disk()).toBeNull()
    expect(service.getSnapshot().status).toBe('signed-out')
    expect(events.some((event) => event.accessToken === 'b.payload.signature')).toBe(false)
  })
  it('does not dispatch refresh when erasing consumed credential fails', async () => {
    const { service, storage, request, advance } = setup()
    await service.login(input)
    advance()
    storage.clear.mockImplementationOnce(() => {
      throw new Error('permission')
    })
    await expect(service.refresh()).rejects.toThrow('Account operation failed')
    expect(request).toHaveBeenCalledOnce()
    expect(service.getSnapshot().status).toBe('signed-out')
  })
  it('never accepts unexpected token response fields or leaks backend errors', async () => {
    const { service, request, pair, storage } = setup()
    request.mockResolvedValueOnce({ ...pair(), secret: 'raw-backend-secret' })
    await expect(service.login(input)).rejects.toThrow('Account operation failed')
    request.mockRejectedValueOnce(new Error('password token https://private.invalid'))
    const error = await service.login(input).catch((value) => value)
    expect(error.message).toBe('Account operation failed')
    expect(error.cause).toBeUndefined()
    expect(storage.save).not.toHaveBeenCalled()
  })
  it('bounds session expiry and prevents server session extension on refresh', async () => {
    const { service, request, pair, advance, storage } = setup()
    await service.login(input)
    advance()
    request.mockResolvedValueOnce({
      ...pair('b'),
      sessionExpiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    })
    await expect(service.refresh()).rejects.toThrow('Account operation failed')
    expect(storage.save).toHaveBeenCalledOnce()
  })
  it('keeps versions monotonic across logout and account replacement', async () => {
    const { service, events } = setup()
    await service.login(input)
    await service.logout()
    await service.login(input)
    expect(
      events.every((event, index) => !index || event.version > events[index - 1]!.version),
    ).toBe(true)
    expect(service.getSnapshot().epoch).toBeGreaterThan(1)
  })
  it('starts signed out with zero counters and null fields', () => {
    const { service } = setup()
    expect(service.getSnapshot()).toEqual({
      status: 'signed-out',
      epoch: 0,
      version: 0,
      accessToken: null,
      accessExpiresAt: null,
      sessionId: null,
      clientId: null,
      sessionExpiresAt: null,
      mfaExpiresAt: null,
    })
  })
  it('adds fixed EMAIL/DESKTOP, saves before publication and strips secrets', async () => {
    const { service, request, storage, events } = setup()
    const result = await service.login(input)
    expect(request.mock.calls[0]?.[1]).toEqual({
      ...input,
      provider: 'EMAIL',
      clientType: 'DESKTOP',
    })
    expect(storage.save).toHaveBeenCalledOnce()
    expect(JSON.stringify([result, events])).not.toContain('refreshToken')
    expect(result.status).toBe('signed-in')
    expect(await service.refresh()).toEqual(result)
    expect(request).toHaveBeenCalledOnce()
  })
  it('keeps MFA ticket main-only and accepts exactly one factor', async () => {
    const { service, request, pair } = setup()
    request.mockResolvedValueOnce({ mfaRequired: true, challengeId: id, expiresIn: 300 })
    const pending = await service.login(input)
    expect(pending.status).toBe('mfa-pending')
    expect(JSON.stringify(pending)).not.toContain(id)
    await expect(
      service.completeMfa({ code: '012345', recoveryCode: 'a'.repeat(32) }),
    ).rejects.toThrow(/Invalid account input|Account operation failed/)
    request.mockResolvedValueOnce(pair())
    expect((await service.completeMfa({ code: '012345' })).status).toBe('signed-in')
    expect(request.mock.calls[1]?.[1]).toEqual({
      code: '012345',
      challengeId: id,
      clientType: 'DESKTOP',
    })
    await expect(service.completeMfa({ code: '012345' })).rejects.toThrow(
      /Invalid account input|Account operation failed/,
    )
  })
  it('allows recovery code and expires MFA without dispatch', async () => {
    const { service, request, advance } = setup()
    request.mockResolvedValueOnce({ mfaRequired: true, challengeId: id, expiresIn: 300 })
    await service.login(input)
    advance()
    await expect(service.completeMfa({ recoveryCode: 'a'.repeat(32) })).rejects.toThrow(
      /Invalid account input|Account operation failed/,
    )
    expect(request).toHaveBeenCalledOnce()
  })
  it('singleflights rotation and consumes persisted refresh before sending', async () => {
    const { service, request, pair, advance, disk } = setup()
    await service.login(input)
    advance()
    const wait = deferred()
    request.mockReturnValueOnce(wait.promise)
    const first = service.refresh()
    const second = service.refresh()
    expect(first).toBe(second)
    expect(disk()).toBeNull()
    wait.resolve(pair('b'))
    expect((await first).accessToken).toBe('b.payload.signature')
    expect(await second).toEqual(await first)
    expect(disk()).toBe('b'.repeat(43))
    expect(request).toHaveBeenCalledTimes(2)
  })
  it.each(['network ambiguity', '401', 'invalid response'])(
    'fails closed without retries on refresh %s',
    async (reason) => {
      const { service, request, advance, disk } = setup()
      await service.login(input)
      advance()
      if (reason === 'invalid response') request.mockResolvedValueOnce({ refreshToken: 'secret' })
      else request.mockRejectedValueOnce(new Error(`${reason} secret password`))
      await expect(service.refresh()).rejects.toThrow('Account operation failed')
      await expect(service.refresh()).rejects.toThrow(
        /Invalid account input|Account operation failed/,
      )
      expect(request).toHaveBeenCalledTimes(2)
      expect(disk()).toBeNull()
      expect(service.getSnapshot().status).toBe('signed-out')
    },
  )
  it('does not let late login resurrect logout or a newer account', async () => {
    const { service, request, pair, storage } = setup()
    const late = deferred()
    request.mockReturnValueOnce(late.promise)
    const old = service.login(input)
    await service.logout()
    await service.login(input)
    const saves = storage.save.mock.calls.length
    late.resolve(pair('b'))
    await expect(old).rejects.toThrow(/Invalid account input|Account operation failed/)
    expect(storage.save).toHaveBeenCalledTimes(saves)
    expect(service.getSnapshot().accessToken).toBe('a.payload.signature')
  })
  it('discards late refresh after logout', async () => {
    const { service, request, pair, advance, storage } = setup()
    await service.login(input)
    advance()
    const late = deferred()
    request.mockReturnValueOnce(late.promise)
    const refresh = service.refresh()
    await service.logout()
    late.resolve(pair('b'))
    await expect(refresh).rejects.toThrow(/Invalid account input|Account operation failed/)
    expect(storage.save).toHaveBeenCalledOnce()
    expect(service.getSnapshot().status).toBe('signed-out')
  })
  it('save failure clears state and never publishes access', async () => {
    const { service, request, storage, events } = setup()
    storage.save.mockImplementationOnce(() => {
      throw new Error('secret')
    })
    await expect(service.login(input)).rejects.toThrow('Account operation failed')
    expect(events.some((event) => event.status === 'signed-in')).toBe(false)
    expect(service.getSnapshot().accessToken).toBeNull()
    expect(request.mock.calls.at(-1)?.[0]).toBe('logout')
  })
  it('cleans locally immediately and bounds unsuccessful remote logout', async () => {
    vi.useFakeTimers()
    const { service, request, disk } = setup()
    await service.login(input)
    request.mockReturnValueOnce(new Promise(() => {}))
    const logout = service.logout()
    expect(disk()).toBeNull()
    await expect(service.login(input)).rejects.toThrow(
      /Invalid account input|Account operation failed/,
    )
    await vi.advanceTimersByTimeAsync(2001)
    expect(await logout).toEqual({ remoteRevoked: false })
    expect(service.getSnapshot().status).toBe('signed-out')
  })
  it('restores only once and does not replay failed persisted refresh', async () => {
    const { service, storage, request } = setup()
    storage.load.mockReturnValue('a'.repeat(43))
    request.mockRejectedValueOnce(new Error('network'))
    await Promise.all([service.start(), service.start()])
    await service.start()
    expect(storage.load).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledOnce()
    expect(storage.clear).toHaveBeenCalled()
    expect(service.getSnapshot().status).toBe('signed-out')
  })
  it('startup storage failure is swallowed and broadcasts signed out', async () => {
    const { service, storage, events } = setup()
    storage.load.mockImplementation(() => {
      throw new Error('keychain')
    })
    await expect(service.start()).resolves.toBeUndefined()
    expect(events.at(-1)?.status).toBe('signed-out')
  })
  it('dispose preserves ciphertext but cancels late results and timers', async () => {
    const { service, disk, request } = setup()
    await service.login(input)
    const stored = disk()
    service.dispose()
    expect(disk()).toBe(stored)
    await expect(service.refresh()).rejects.toThrow(
      /Invalid account input|Account operation failed/,
    )
    expect(request).toHaveBeenCalledOnce()
  })
  it('strictly validates register/challenge/reset and handles accepted only', async () => {
    const { service, request } = setup()
    await expect(service.register({ ...input, challengeId: id, proof: '012345' })).rejects.toThrow(
      /Invalid account input|Account operation failed/,
    )
    await expect(service.login({ ...input, clientType: 'MOBILE' })).rejects.toThrow(
      /Invalid account input|Account operation failed/,
    )
    request.mockResolvedValueOnce({
      accepted: true,
      challengeId: id,
      expiresIn: 600,
      retryAfter: 60,
    })
    expect(
      (await service.requestChallenge({ subject: input.subject, purpose: 'RESET' })).accepted,
    ).toBe(true)
    request.mockResolvedValueOnce({ success: true })
    expect(
      await service.resetPassword({ challengeId: id, proof: '012345', password: 'Strong1!' }),
    ).toEqual({ success: true })
    expect(service.getSnapshot().status).toBe('signed-out')
  })
})

it('register accepts the current ordinary-session response including isPublicDevice=false', async () => {
  const f = setup()
  f.request.mockResolvedValueOnce({ ...f.pair(), isPublicDevice: false, clientId: null })
  const result = await f.service.register({
    ...input,
    password: 'Strong1!',
    challengeId: id,
    proof: '012345',
  })
  expect(result.status).toBe('signed-in')
  expect(f.storage.save).toHaveBeenCalledOnce()
})
it('registration response failure is distinct from credential storage failure', async () => {
  const malformed = setup()
  malformed.request.mockResolvedValueOnce({ ...malformed.pair(), isPublicDevice: 'false' })
  await expect(
    malformed.service.register({
      ...input,
      password: 'Strong1!',
      challengeId: id,
      proof: '012345',
    }),
  ).rejects.toMatchObject({ message: 'Account operation failed: response' })
  expect(malformed.storage.save).not.toHaveBeenCalled()
  const storage = setup()
  storage.storage.save.mockImplementationOnce(() => {
    throw Error('private storage details')
  })
  await expect(
    storage.service.register({ ...input, password: 'Strong1!', challengeId: id, proof: '012345' }),
  ).rejects.toMatchObject({ message: 'Account operation failed: storage' })
  expect(storage.service.getSnapshot().status).toBe('signed-out')
})
