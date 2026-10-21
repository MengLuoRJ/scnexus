import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { effectScope, reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { AccountError, type Experience } from '../../apis'
import { usePersonalCenter } from './usePersonalCenter'

const mocks = vi.hoisted(() => ({
  load: vi.fn<(...args: unknown[]) => Promise<Experience>>(),
  save: vi.fn<(...args: unknown[]) => Promise<{ nickname: string }>>(),
  check: vi.fn<(...args: unknown[]) => Promise<Experience>>(),
  update: vi.fn<(...args: unknown[]) => void>(),
  auth: {} as Record<string, unknown>,
}))
vi.mock('../../stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('../../apis/personal-center', () => ({
  apiUserExperience: mocks.load,
  apiUserNickname: mocks.save,
  apiUserCheckIn: mocks.check,
}))
const initial: Experience = {
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
const reward: Experience = {
  ...initial,
  experience: 100,
  level: 1,
  nextLevelExperience: 600,
  experienceToNextLevel: 500,
  checkedIn: true,
  awardedExperience: 10,
}
let scope = effectScope()
function setup() {
  scope = effectScope()
  return scope.run(() => usePersonalCenter())!
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T15:59:59Z'))
  mocks.auth = reactive({
    signedIn: true,
    snapshot: { epoch: 1, sessionId: 'one' },
    httpAuth: {},
    updateNickname: mocks.update,
  })
  mocks.load.mockResolvedValue(initial)
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})
test('loads automatically and replaces with authoritative check-in values, including duplicate awards', async () => {
  const center = setup()
  await flushPromises()
  expect(center.experience.value).toEqual(initial)
  mocks.check
    .mockResolvedValueOnce(reward)
    .mockResolvedValueOnce({ ...reward, awardedExperience: 0 })
  expect(await center.checkIn()).toEqual(reward)
  await center.checkIn()
  expect(center.experience.value).toEqual({ ...reward, awardedExperience: 0 })
  expect(center.checking.value).toBe(false)
})
test('automatic failures are exposed safely; manual errors throw and preserve old data', async () => {
  const center = setup()
  await flushPromises()
  mocks.load.mockRejectedValue(new Error('private transport details'))
  await expect(center.loadExperience()).rejects.toMatchObject({ kind: 'network' })
  expect(center.experience.value).toEqual(initial)
  await vi.advanceTimersByTimeAsync(1000)
  expect(center.error.value).toBeInstanceOf(AccountError)
  expect(center.loading.value).toBe(false)
})
test('successful nickname writes use the server name without loading authorization', async () => {
  const center = setup()
  mocks.save.mockResolvedValue({ nickname: 'Nexus_123' })
  expect(await center.saveNickname('inputname')).toBe('Nexus_123')
  expect(mocks.update).toHaveBeenCalledWith('Nexus_123', 1, 'one')
  expect(center.saving.value).toBe(false)
})
test('logout immediately clears data and errors and ignores late loads and nickname writes', async () => {
  const center = setup()
  await flushPromises()
  const load = deferred<Experience>()
  const save = deferred<{ nickname: string }>()
  mocks.load.mockReturnValueOnce(load.promise)
  mocks.save.mockReturnValueOnce(save.promise)
  const loading = center.loadExperience()
  const saving = center.saveNickname('Nexus_123')
  mocks.auth.signedIn = false
  expect(center.experience.value).toBeNull()
  expect(center.error.value).toBeNull()
  expect(center.loading.value).toBe(false)
  expect(center.saving.value).toBe(false)
  load.resolve(reward)
  save.resolve({ nickname: 'Nexus_123' })
  await loading
  await expect(saving).rejects.toMatchObject({ kind: 'stale' })
  expect(mocks.update).not.toHaveBeenCalled()
  expect(center.experience.value).toBeNull()
})
test('account switching discards late check-in and starts a new load', async () => {
  const center = setup()
  await flushPromises()
  const late = deferred<Experience>()
  mocks.check.mockReturnValueOnce(late.promise)
  const pending = center.checkIn()
  mocks.auth.snapshot = { epoch: 2, sessionId: 'two' }
  expect(center.experience.value).toBeNull()
  await flushPromises()
  late.resolve(reward)
  expect(await pending).toBeUndefined()
  expect(center.experience.value).toEqual(initial)
})
test('late pre-check-in GET cannot overwrite a successful reward', async () => {
  const center = setup()
  await flushPromises()
  const late = deferred<Experience>()
  mocks.load.mockReturnValueOnce(late.promise)
  const loading = center.loadExperience()
  mocks.check.mockResolvedValueOnce(reward)
  await center.checkIn()
  late.resolve(initial)
  await loading
  expect(center.experience.value).toEqual(reward)
})
test('write failures are sanitized and always release busy flags', async () => {
  const center = setup()
  mocks.save.mockRejectedValue(new Error('secret'))
  mocks.check.mockRejectedValue(new AccountError('rateLimited'))
  await expect(center.saveNickname('Nexus_123')).rejects.toMatchObject({ kind: 'network' })
  await expect(center.checkIn()).rejects.toMatchObject({ kind: 'rateLimited' })
  expect(center.saving.value).toBe(false)
  expect(center.checking.value).toBe(false)
})
test('same-session access-token refresh does not clear experience or reload', async () => {
  const center = setup()
  await flushPromises()
  mocks.auth.snapshot = { epoch: 1, sessionId: 'one', version: 2 }
  await flushPromises()
  expect(center.experience.value).toEqual(initial)
  expect(mocks.load).toHaveBeenCalledOnce()
})
test('midnight and visibility refresh from the server and scope disposal removes both', async () => {
  const center = setup()
  await flushPromises()
  const tomorrow = { ...initial, date: '2026-10-20', nextCheckInAt: '2026-10-20T16:00:00Z' }
  mocks.load.mockResolvedValue(tomorrow)
  await vi.advanceTimersByTimeAsync(1000)
  expect(center.experience.value).toEqual(tomorrow)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  expect(mocks.load).toHaveBeenCalledTimes(3)
  scope.stop()
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(86400000)
  expect(mocks.load).toHaveBeenCalledTimes(3)
})
