import { beforeEach, expect, test, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
import { apiUserCheckIn, apiUserExperience, apiUserNickname } from '../personal-center'
const mocks = vi.hoisted(() => ({
  request: vi.fn<(config: AxiosRequestConfig) => Promise<{ data: unknown }>>(),
}))
vi.mock('axios', () => ({
  default: {
    create: () => ({ request: mocks.request }),
    isAxiosError: (error: unknown) =>
      Boolean(error && typeof error === 'object' && 'isAxiosError' in error),
  },
}))
const auth = {
  getSnapshot: (): AuthSnapshot => ({
    status: 'signed-in',
    epoch: 1,
    version: 1,
    sessionId: 'session',
    accessToken: 'token',
    accessExpiresAt: 10000,
    sessionExpiresAt: null,
    mfaExpiresAt: null,
  }),
  refresh: vi.fn<() => Promise<void>>(),
  invalidate: vi.fn<() => Promise<void>>(),
}
const experience = {
  experience: 90,
  level: 0,
  nextLevelExperience: 100,
  experienceToNextLevel: 10,
  date: '2026-10-19',
  timezone: 'Asia/Shanghai',
  checkedIn: false,
  awardedExperience: 0,
  nextCheckInAt: '2026-10-19T16:00:00Z',
}
beforeEach(() => vi.resetAllMocks())
test('fixed self-only endpoints send only their documented payload and discard additional response data', async () => {
  mocks.request.mockResolvedValueOnce({ data: { nickname: 'Nexus_123', userId: 'discard' } })
  expect(await apiUserNickname(auth, 'Nexus_123')).toEqual({ nickname: 'Nexus_123' })
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      url: '/users/me/nickname',
      method: 'PATCH',
      data: { nickname: 'Nexus_123' },
    }),
  )
  mocks.request.mockResolvedValue({ data: { ...experience, secret: 'discard' } })
  expect(await apiUserExperience(auth)).toEqual(experience)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      url: '/users/me/experience',
      method: 'GET',
      data: undefined,
    }),
  )
  expect(await apiUserCheckIn(auth)).toEqual(experience)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      url: '/users/me/check-in',
      method: 'POST',
      data: {},
    }),
  )
})
test.each([apiUserCheckIn, (context: typeof auth) => apiUserNickname(context, 'Nexus_123')])(
  'never retries rejected writes and invalidates 401',
  async (run) => {
    mocks.request.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    await expect(run(auth)).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(mocks.request).toHaveBeenCalledTimes(1)
    expect(auth.refresh).not.toHaveBeenCalled()
    expect(auth.invalidate).toHaveBeenCalledOnce()
  },
)
test.each([
  { experience: -1 },
  { experience: 1.5 },
  { experience: Number.MAX_SAFE_INTEGER + 1 },
  { level: 4 },
  { nextLevelExperience: -1 },
  { experienceToNextLevel: -1 },
  { awardedExperience: -10 },
  { checkedIn: 'false' },
  { timezone: 'UTC' },
  { date: '2026-02-30' },
  { date: '2026-2-03' },
  { nextCheckInAt: '2026-10-19T00:00:00Z' },
  { nextCheckInAt: '2026-10-20T16:00:00Z' },
  { nextCheckInAt: 'invalid' },
  { nextCheckInAt: '2026-10-19T16:00:00+00:00' },
])('rejects invalid experience projection %j', async (change) => {
  mocks.request.mockResolvedValue({ data: { ...experience, ...change } })
  await expect(apiUserExperience(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
})
test('accepts maximum-level and duplicate-sign-in responses without changing experience', async () => {
  const highest = {
    ...experience,
    experience: 2500,
    level: 3,
    nextLevelExperience: null,
    experienceToNextLevel: 0,
    checkedIn: true,
    awardedExperience: 0,
  }
  mocks.request.mockResolvedValue({ data: highest })
  expect(await apiUserCheckIn(auth)).toEqual(highest)
})
test.each([null, {}, { nickname: '' }, { nickname: 1 }])(
  'rejects invalid nickname response %j',
  async (data) => {
    mocks.request.mockResolvedValue({ data })
    await expect(apiUserNickname(auth, 'Nexus_123')).rejects.toMatchObject({
      kind: 'invalidResponse',
    })
  },
)
test('write transport failures do not retry or leak transport configuration', async () => {
  mocks.request.mockImplementation((config: AxiosRequestConfig) =>
    Promise.reject({ config, secret: 'private' }),
  )
  await expect(apiUserCheckIn(auth)).rejects.toMatchObject({ kind: 'network' })
  expect(mocks.request).toHaveBeenCalledOnce()
})
