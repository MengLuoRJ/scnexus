import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { localMutatorCatalog, localWeeklyMutation } from '@scnexus/app-shared/mutations/local-data'
const mocks = vi.hoisted(() => ({
  get: vi.fn<
    (
      url: string,
      options: { signal: AbortSignal; timeout: number; headers?: unknown },
    ) => Promise<{ data: unknown }>
  >(),
  settings: { officialServicesEnabled: false, weeklyMutationCalibrationEnabled: true },
}))
vi.mock('axios', () => ({ default: { get: mocks.get } }))
vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('../../../stores/setting', () => ({
  settingRepository: { getSnapshot: () => mocks.settings },
}))
import { readMutators, readWeeklyMutation } from '../mutations'
const signal = () => new AbortController().signal
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
  mocks.get.mockReset()
  mocks.settings = { officialServicesEnabled: false, weeklyMutationCalibrationEnabled: true }
})
afterEach(() => vi.useRealTimers())
test.each([
  [false, false],
  [false, true],
  [true, false],
])(
  'offline flags %s/%s never contact services',
  async (officialServicesEnabled, weeklyMutationCalibrationEnabled) => {
    mocks.settings = { officialServicesEnabled, weeklyMutationCalibrationEnabled }
    const catalog = await readMutators({ language: 'frFR', offset: 1, limit: 2 }, signal())
    expect(catalog.items.map((item) => item.id)).toEqual(
      localMutatorCatalog('frFR')
        .items.slice(1, 3)
        .map((item) => item.id),
    )
    expect(JSON.stringify(catalog)).not.toMatch(/sourceId|iconName/)
    expect(catalog.total).toBe(localMutatorCatalog().items.length)
    expect(await readWeeklyMutation({ region: 'EU', language: 'enUS' }, signal())).toMatchObject({
      region: 'EU',
      language: 'enUS',
      available: true,
    })
    expect(mocks.get).not.toHaveBeenCalled()
  },
)
test('search covers multilingual names and descriptions, bounds are validated', async () => {
  const factor = localMutatorCatalog().items[0]!
  const result = await readMutators({ search: factor.name.zhCN }, signal())
  expect(result.items.map((item) => item.id)).toContain(factor.id)
  await expect(readMutators({ offset: -1 }, signal())).rejects.toThrow('INVALID_ARGUMENT')
  await expect(readMutators({ limit: 101 }, signal())).rejects.toThrow('INVALID_ARGUMENT')
  await expect(readMutators({ language: 'bad' as never }, signal())).rejects.toThrow(
    'INVALID_ARGUMENT',
  )
  await expect(readWeeklyMutation({ region: 'bad' as never }, signal())).rejects.toThrow(
    'INVALID_ARGUMENT',
  )
})
test('calibration is anonymous, bounded and strips unrecognized source fields', async () => {
  mocks.settings.officialServicesEnabled = true
  const catalog = localMutatorCatalog()
  mocks.get.mockResolvedValue({
    data: {
      ...catalog,
      revision: 99,
      source: 'private',
      items: catalog.items.map((item) => ({ ...item, url: 'private', source: 'private' })),
    },
  })
  const result = await readMutators({}, signal())
  expect(result.revision).toBe(99)
  expect(JSON.stringify(result)).not.toContain('private')
  expect(mocks.get.mock.calls[0]![1]).toMatchObject({
    timeout: 5000,
    maxRedirects: 0,
    withCredentials: false,
  })
  expect(mocks.get.mock.calls[0]![1].headers).toBeUndefined()
  const weekly = localWeeklyMutation()
  mocks.get.mockResolvedValue({ data: { ...weekly, revision: 99, source: 'private' } })
  expect(await readWeeklyMutation({}, signal())).toMatchObject({ revision: 99, available: true })
})
test('failed, invalid, empty and unavailable calibration preserve local results', async () => {
  mocks.settings.officialServicesEnabled = true
  const local = await readWeeklyMutation({}, signal())
  mocks.get.mockRejectedValue(new Error('network URL must not leak'))
  expect(await readWeeklyMutation({}, signal())).toEqual(local)
  expect((await readMutators({}, signal())).items.length).toBeGreaterThan(0)
  for (const data of [
    {},
    { revision: 3, items: [] },
    { ...local, available: false, reason: 'NO_SCHEDULE' },
  ]) {
    mocks.get.mockResolvedValue({ data })
    expect(await readWeeklyMutation({}, signal())).toEqual(local)
    expect((await readMutators({}, signal())).items.length).toBeGreaterThan(0)
  }
})
test('flags disabled during calibration discard the result', async () => {
  mocks.settings.officialServicesEnabled = true
  mocks.get.mockImplementation(async () => {
    mocks.settings.weeklyMutationCalibrationEnabled = false
    return { data: { ...localMutatorCatalog(), revision: 999 } }
  })
  expect((await readMutators({}, signal())).revision).toBe(localMutatorCatalog().revision)
})
test('already cancelled reads do not access the network', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(readMutators({}, controller.signal)).rejects.toThrow('REQUEST_CANCELLED')
  await expect(readWeeklyMutation({}, controller.signal)).rejects.toThrow('REQUEST_CANCELLED')
  expect(mocks.get).not.toHaveBeenCalled()
})
test.each([readMutators, readWeeklyMutation])(
  'inflight cancellation propagates rather than falling back',
  async (read) => {
    mocks.settings.officialServicesEnabled = true
    mocks.get.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
            once: true,
          })
        }),
    )
    const controller = new AbortController()
    const request = read({}, controller.signal)
    controller.abort()
    await expect(request).rejects.toThrow('REQUEST_CANCELLED')
  },
)
test('bounded calibration timeout falls back locally', async () => {
  mocks.settings.officialServicesEnabled = true
  mocks.get.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
      }),
  )
  const timeout = new AbortController()
  const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal)
  const result = readWeeklyMutation({}, signal())
  expect(spy).toHaveBeenCalledWith(5000)
  timeout.abort()
  expect(await result).toMatchObject({ available: true })
  spy.mockRestore()
})
