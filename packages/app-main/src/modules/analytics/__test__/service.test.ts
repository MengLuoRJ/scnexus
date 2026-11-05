import { afterEach, expect, test, vi } from 'vitest'
import { createAnalyticsService } from '../service'
import { AnalyticsRequestError } from '../transport'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
const credential = { visitorToken: 'installation-token', expiresAt: '2030-01-01T00:00:00Z' }
const registration = {
  ...credential,
  clientType: 'DESKTOP',
  heartbeatIntervalSeconds: 30,
  onlineWindowSeconds: 90,
}
const signedIn = {
  status: 'signed-in',
  accessToken: 'access',
  sessionId: 'session',
} as AuthSnapshot
function setup() {
  const request = vi.fn<(...args: unknown[]) => Promise<unknown>>(async (operation) =>
    String(operation).startsWith('register')
      ? registration
      : { accepted: true, heartbeatIntervalSeconds: 30, onlineWindowSeconds: 90 },
  )
  const clear = vi.fn<() => void>()
  const save = vi.fn<(value: typeof credential) => void>()
  const load = vi.fn<() => typeof credential | null>(() => credential)
  const service = createAnalyticsService({
    storage: { load, save, clear },
    transport: { request },
    getClientId: () => '7d6b0c48-40c8-4ae0-9197-95e41f11cced',
  })
  return { service, request, save, load, clear }
}
afterEach(() => vi.useRealTimers())
test('startup login and logout reuse visitor and continue heartbeat every 30 seconds', async () => {
  vi.useFakeTimers()
  const f = setup()
  await f.service.startup(null)
  await f.service.startup(null)
  await f.service.login(signedIn)
  await f.service.logout()
  expect(f.request.mock.calls.map((call) => call[0])).toEqual([
    'register-anonymous',
    'heartbeat-anonymous',
    'register-authenticated',
    'heartbeat-authenticated',
    'register-anonymous',
    'heartbeat-anonymous',
  ])
  for (const call of f.request.mock.calls)
    expect(call[1]).toMatchObject({ visitorToken: credential.visitorToken })
  expect(f.request.mock.calls[2]![3]).toBe('access')
  expect(f.request.mock.calls[4]![3]).toBeUndefined()
  await vi.advanceTimersByTimeAsync(300000)
  expect(f.request).toHaveBeenCalledTimes(16)
  f.service.dispose()
})
test('offline registration is silent, skips heartbeat and does not retry until another lifecycle event', async () => {
  const f = setup()
  f.request.mockRejectedValueOnce(new AnalyticsRequestError('network'))
  await expect(f.service.startup(null)).resolves.toBeUndefined()
  expect(f.request).toHaveBeenCalledOnce()
  await f.service.login(signedIn)
  expect(f.request).toHaveBeenCalledTimes(1)
  await f.service.setOnline(true)
  expect(f.request).toHaveBeenCalledTimes(3)
  f.service.dispose()
})
test('heartbeat failure is silent and never repeated', async () => {
  const f = setup()
  f.request.mockResolvedValueOnce(registration).mockRejectedValueOnce(new Error('offline'))
  await expect(f.service.startup(null)).resolves.toBeUndefined()
  expect(f.request).toHaveBeenCalledTimes(2)
  f.service.dispose()
})
test('restored session startup is authenticated without an extra anonymous request', async () => {
  const f = setup()
  await f.service.startup(signedIn)
  expect(f.request.mock.calls.map((call) => call[0])).toEqual([
    'register-authenticated',
    'heartbeat-authenticated',
  ])
  f.service.dispose()
})
test('storage failure is silent without network requests', async () => {
  const f = setup()
  f.load.mockImplementation(() => {
    throw new Error('unreadable')
  })
  await expect(f.service.startup(null)).resolves.toBeUndefined()
  expect(f.request).not.toHaveBeenCalled()
  f.service.dispose()
})
test('stale registration preserves visitor identity but cannot send an obsolete heartbeat', async () => {
  const f = setup()
  f.load.mockReturnValue(null)
  let resolve!: (value: unknown) => void
  f.request.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const startup = f.service.startup(null)
  await Promise.resolve()
  const login = f.service.login(signedIn)
  resolve(registration)
  await startup
  await login
  expect(f.request.mock.calls.map((call) => call[0])).toEqual([
    'register-anonymous',
    'register-authenticated',
    'heartbeat-authenticated',
  ])
  expect(f.request.mock.calls[1]![1]).toMatchObject({ visitorToken: credential.visitorToken })
  f.service.dispose()
})
test('hung transport is bounded and not retried', async () => {
  vi.useFakeTimers()
  const f = setup()
  f.request.mockImplementationOnce(() => new Promise(() => {}))
  const result = f.service.startup(null)
  await vi.advanceTimersByTimeAsync(5000)
  await result
  expect(f.request).toHaveBeenCalledOnce()
  f.service.dispose()
})

test('known expired visitor is omitted from the first registration, without failing a request first', async () => {
  const f = setup()
  f.load.mockReturnValue({ ...credential, expiresAt: '2020-01-01T00:00:00Z' })
  await f.service.startup(null)
  expect(f.clear).toHaveBeenCalledOnce()
  expect(f.request.mock.calls[0]![1]).not.toHaveProperty('visitorToken')
  expect(f.request).toHaveBeenCalledTimes(2)
  f.service.dispose()
})
test('disabled startup performs no storage or HTTP, enabling starts and disabling cancels timers', async () => {
  vi.useFakeTimers()
  const f = setup()
  await f.service.setEnabled(false)
  await f.service.startup(null)
  expect(f.request).not.toHaveBeenCalled()
  expect(f.load).not.toHaveBeenCalled()
  await f.service.setEnabled(true)
  expect(f.request).toHaveBeenCalledTimes(2)
  await f.service.setEnabled(false)
  await vi.advanceTimersByTimeAsync(300000)
  expect(f.request).toHaveBeenCalledTimes(2)
  f.service.dispose()
})
test('offline pauses all requests until an online signal', async () => {
  vi.useFakeTimers()
  const f = setup()
  await f.service.setOnline(false)
  await f.service.startup(null)
  await vi.advanceTimersByTimeAsync(300000)
  expect(f.request).not.toHaveBeenCalled()
  await f.service.setOnline(true)
  expect(f.request).toHaveBeenCalledTimes(2)
  await f.service.setOnline(false)
  await vi.advanceTimersByTimeAsync(300000)
  expect(f.request).toHaveBeenCalledTimes(2)
  f.service.dispose()
})
test('503 uses bounded jittered backoff without discarding visitor identity', async () => {
  vi.useFakeTimers()
  const f = setup()
  f.request.mockRejectedValueOnce(new AnalyticsRequestError('http', 503))
  await f.service.startup(null)
  expect(f.request).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(5999)
  expect(f.request).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1001)
  expect(f.request).toHaveBeenCalledTimes(3)
  expect(f.clear).not.toHaveBeenCalled()
  f.service.dispose()
})
test('429 never retries before the server Retry-After floor', async () => {
  vi.useFakeTimers()
  const f = setup()
  f.request.mockRejectedValueOnce(new AnalyticsRequestError('http', 429, 120000))
  await f.service.startup(null)
  await vi.advanceTimersByTimeAsync(119999)
  expect(f.request).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1)
  expect(f.request).toHaveBeenCalledTimes(3)
  f.service.dispose()
})
test('anonymous visitor 401 repairs at most once and authenticated 401 never refreshes or discards credentials', async () => {
  vi.useFakeTimers()
  const anonymous = setup()
  anonymous.request.mockRejectedValue(new AnalyticsRequestError('http', 401))
  await anonymous.service.startup(null)
  await vi.advanceTimersByTimeAsync(1)
  expect(anonymous.request).toHaveBeenCalledTimes(2)
  expect(anonymous.clear).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(300000)
  expect(anonymous.request).toHaveBeenCalledTimes(2)
  anonymous.service.dispose()
  const auth = setup()
  auth.request.mockRejectedValue(new AnalyticsRequestError('http', 401))
  await auth.service.startup(signedIn)
  await vi.advanceTimersByTimeAsync(300000)
  expect(auth.request).toHaveBeenCalledOnce()
  expect(auth.clear).not.toHaveBeenCalled()
  auth.service.dispose()
})
test('refresh updates the Access used by the next beat without another registration', async () => {
  vi.useFakeTimers()
  const f = setup()
  await f.service.startup(signedIn)
  await f.service.authenticationChanged({ ...signedIn, status: 'refreshing' })
  await f.service.authenticationChanged({ ...signedIn, accessToken: 'new-access' })
  expect(f.request).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(30000)
  expect(f.request.mock.calls[2]![0]).toBe('heartbeat-authenticated')
  expect(f.request.mock.calls[2]![3]).toBe('new-access')
  f.service.dispose()
})

test('disabling while registration is in flight prevents storage and follow-up heartbeats', async () => {
  const f = setup()
  let done!: (value: unknown) => void
  f.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve
      }),
  )
  const task = f.service.startup(null)
  await Promise.resolve()
  await f.service.setEnabled(false)
  done(registration)
  await task
  await Promise.resolve()
  expect(f.save).not.toHaveBeenCalled()
  expect(f.request).toHaveBeenCalledOnce()
  f.service.dispose()
})
test('leave uses the captured authenticated session once without registration or retries', async () => {
  vi.useFakeTimers()
  const f = setup()
  await f.service.startup(signedIn)
  await f.service.authenticationChanged({ status: 'signed-out' } as AuthSnapshot)
  await f.service.leave(signedIn)
  expect(f.request.mock.calls[2]).toEqual([
    'leave',
    { visitorToken: credential.visitorToken },
    expect.any(AbortSignal),
    'access',
  ])
  await vi.advanceTimersByTimeAsync(90000)
  expect(f.request).toHaveBeenCalledTimes(3)
  await f.service.logout()
  expect(f.request.mock.calls[3]![0]).toBe('register-anonymous')
  expect(f.clear).not.toHaveBeenCalled()
  f.service.dispose()
})
test('hung leave is aborted within one second and rejection never blocks logout', async () => {
  vi.useFakeTimers()
  const f = setup()
  await f.service.startup(signedIn)
  f.request.mockImplementationOnce(() => new Promise(() => {}))
  const leave = f.service.leave(signedIn)
  await vi.advanceTimersByTimeAsync(1000)
  await expect(leave).resolves.toBeUndefined()
  expect((f.request.mock.calls[2]![2] as AbortSignal).aborted).toBe(true)
  await f.service.logout()
  expect(f.request.mock.calls[3]![0]).toBe('register-anonymous')
  f.service.dispose()
})
test.each([401, 403, 429, 503])(
  'leave failure %i never discards credentials or retries',
  async (status) => {
    vi.useFakeTimers()
    const f = setup()
    await f.service.startup(signedIn)
    f.request.mockRejectedValueOnce(new AnalyticsRequestError('http', status))
    await expect(f.service.leave(signedIn)).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(90000)
    expect(f.request).toHaveBeenCalledTimes(3)
    expect(f.clear).not.toHaveBeenCalled()
    f.service.dispose()
  },
)
test('disabling cancels a pending leave without waiting for its timeout', async () => {
  vi.useFakeTimers()
  const f = setup()
  await f.service.startup(signedIn)
  f.request.mockImplementationOnce(() => new Promise(() => {}))
  const leave = f.service.leave(signedIn)
  await f.service.setEnabled(false)
  await expect(leave).resolves.toBeUndefined()
  expect((f.request.mock.calls[2]![2] as AbortSignal).aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  f.service.dispose()
})
test('disabled and offline analytics skip leave', async () => {
  const f = setup()
  await f.service.startup(signedIn)
  await f.service.setOnline(false)
  await f.service.leave(signedIn)
  await f.service.setEnabled(false)
  await f.service.leave(signedIn)
  expect(f.request).toHaveBeenCalledTimes(2)
  f.service.dispose()
})
test('overlong registration credentials are not persisted or sent to heartbeat', async () => {
  const f = setup()
  f.request.mockResolvedValueOnce({ ...registration, visitorToken: 'x'.repeat(1025) })
  await f.service.startup(null)
  expect(f.save).not.toHaveBeenCalled()
  expect(f.request).toHaveBeenCalledOnce()
  f.service.dispose()
})
test('malformed heartbeat pauses the cycle instead of reporting online success', async () => {
  vi.useFakeTimers()
  const f = setup()
  f.request.mockResolvedValueOnce(registration).mockResolvedValueOnce({ accepted: false })
  await f.service.startup(null)
  await vi.advanceTimersByTimeAsync(300000)
  expect(f.request).toHaveBeenCalledTimes(2)
  f.service.dispose()
})
