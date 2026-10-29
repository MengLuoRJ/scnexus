import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { useWeeklyMutations } from '../useWeeklyMutations'
import { localMutatorCatalog, localWeeklyMutation } from '../local-data'
import { useContentCenterStore } from '../../../stores/content-center'
import type { WeeklyMutation } from '../../../apis/weekly-mutations'
const mocks = vi.hoisted(() => ({
  weekly: vi.fn<() => Promise<unknown>>(),
  catalog: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('../../../apis/weekly-mutations', () => ({
  apiWeeklyMutation: mocks.weekly,
  apiMutatorCatalog: mocks.catalog,
}))
const wrappers: { unmount(): void }[] = []
function setup() {
  const failure = vi.fn<() => void>()
  let state!: ReturnType<typeof useWeeklyMutations>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useWeeklyMutations(failure)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  return { state, failure, wrapper }
}
function calibrated(): WeeklyMutation {
  const local = localWeeklyMutation()
  if (!local.available) throw new Error('Expected bundled schedule')
  return { ...local, revision: 999, dataStatus: 'verified' }
}
beforeEach(() => {
  setActivePinia(createPinia())
  useContentCenterStore().initialized = true
  vi.useFakeTimers()
  vi.setSystemTime('2026-10-23T00:00:00Z')
  mocks.weekly.mockResolvedValue(calibrated())
  mocks.catalog.mockResolvedValue({ revision: 999, items: [localMutatorCatalog().items[0]] })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})
test('saved settings initialize before any calibration requests while local data stays visible', async () => {
  const services = useContentCenterStore()
  services.initialized = false
  let finish!: () => void
  vi.spyOn(services, 'initialize').mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          services.officialServicesEnabled = false
          services.initialized = true
          resolve()
        }
      }),
  )
  const { state } = setup()
  expect(services.initialize).toHaveBeenCalledOnce()
  expect(state.current.value).toEqual(localWeeklyMutation())
  expect(state.catalog.value).toEqual(localMutatorCatalog())
  expect(mocks.weekly).not.toHaveBeenCalled()
  expect(mocks.catalog).not.toHaveBeenCalled()
  finish()
  await flushPromises()
  expect(mocks.weekly).not.toHaveBeenCalled()
  expect(mocks.catalog).not.toHaveBeenCalled()
})
test('calibration starts after settings initialize with both flags enabled', async () => {
  const services = useContentCenterStore()
  services.initialized = false
  let finish!: () => void
  vi.spyOn(services, 'initialize').mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          services.initialized = true
          resolve()
        }
      }),
  )
  const { state } = setup()
  expect(mocks.weekly).not.toHaveBeenCalled()
  finish()
  await flushPromises()
  expect(mocks.weekly).toHaveBeenCalledOnce()
  expect(mocks.catalog).toHaveBeenCalledOnce()
  expect(state.current.value).toEqual(calibrated())
})
test('settings initialization failure leaves local data usable without HTTP', async () => {
  const services = useContentCenterStore()
  services.initialized = false
  vi.spyOn(services, 'initialize').mockRejectedValue(new Error('settings unavailable'))
  const { state, failure } = setup()
  await flushPromises()
  expect(state.current.value).toEqual(localWeeklyMutation())
  expect(state.catalog.value).toEqual(localMutatorCatalog())
  expect(mocks.weekly).not.toHaveBeenCalled()
  expect(mocks.catalog).not.toHaveBeenCalled()
  expect(failure).not.toHaveBeenCalled()
})
test('local schedule and catalog are immediately usable while calibration is pending', () => {
  mocks.weekly.mockReturnValue(new Promise(() => {}))
  mocks.catalog.mockReturnValue(new Promise(() => {}))
  const { state } = setup()
  expect(state.current.value).toEqual(localWeeklyMutation())
  expect(state.catalog.value).toEqual(localMutatorCatalog())
  expect(state.weeklyLoading.value).toBe(true)
  expect(state.catalogLoading.value).toBe(true)
})
test('offline requests retain local data without a failure toast', async () => {
  mocks.weekly.mockRejectedValue(new Error('offline'))
  mocks.catalog.mockRejectedValue(new Error('offline'))
  const { state, failure } = setup()
  await flushPromises()
  expect(state.current.value).toEqual(localWeeklyMutation())
  expect(state.catalog.value).toEqual(localMutatorCatalog())
  expect(state.weeklyError.value).toBe(false)
  expect(state.catalogError.value).toBe(false)
  expect(failure).not.toHaveBeenCalled()
})
test.each(['officialServicesEnabled', 'weeklyMutationCalibrationEnabled'] as const)(
  '%s disabled makes no requests, including refresh and selection changes',
  async (key) => {
    useContentCenterStore()[key] = false
    const { state } = setup()
    await state.loadWeekly()
    await state.loadCatalog()
    state.region.value = 'NA'
    state.language.value = 'koKR'
    expect(state.current.value).toEqual(localWeeklyMutation(Date.now(), undefined, 'NA', 'koKR'))
    expect(state.catalog.value).toEqual(localMutatorCatalog('koKR'))
    expect(mocks.weekly).not.toHaveBeenCalled()
    expect(mocks.catalog).not.toHaveBeenCalled()
    expect(state.weeklyLoading.value).toBe(false)
    expect(state.catalogLoading.value).toBe(false)
  },
)
test('successful calibration improves local data; switching off immediately restores local', async () => {
  const { state } = setup()
  await flushPromises()
  expect(state.current.value).toEqual(calibrated())
  expect(state.catalog.value?.revision).toBe(999)
  useContentCenterStore().weeklyMutationCalibrationEnabled = false
  expect(state.current.value).toEqual(localWeeklyMutation())
  expect(state.catalog.value).toEqual(localMutatorCatalog())
  useContentCenterStore().weeklyMutationCalibrationEnabled = true
  await flushPromises()
  expect(state.current.value).toEqual(calibrated())
})
test('late in-flight results while disabled cannot overwrite local data', async () => {
  let resolveWeekly!: (value: unknown) => void
  let resolveCatalog!: (value: unknown) => void
  mocks.weekly.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolveWeekly = yes
      }),
  )
  mocks.catalog.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolveCatalog = yes
      }),
  )
  const { state } = setup()
  useContentCenterStore().weeklyMutationCalibrationEnabled = false
  resolveWeekly(calibrated())
  resolveCatalog({ revision: 999, items: [localMutatorCatalog().items[0]] })
  await flushPromises()
  expect(state.current.value).toEqual(localWeeklyMutation())
  expect(state.catalog.value).toEqual(localMutatorCatalog())
  expect(state.weeklyLoading.value).toBe(false)
  expect(state.catalogLoading.value).toBe(false)
})
test('toggle off and on discards old in-flight calibration even after re-enabling', async () => {
  let resolveWeekly!: (value: unknown) => void
  let resolveCatalog!: (value: unknown) => void
  mocks.weekly.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolveWeekly = yes
      }),
  )
  mocks.catalog.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolveCatalog = yes
      }),
  )
  const { state } = setup()
  const services = useContentCenterStore()
  services.officialServicesEnabled = false
  expect(state.weeklyLoading.value).toBe(false)
  expect(state.catalogLoading.value).toBe(false)
  services.officialServicesEnabled = true
  mocks.weekly.mockResolvedValueOnce({ available: false, reason: 'NO_SCHEDULE' })
  await flushPromises()
  const acceptedWeekly = state.weekly.value
  const acceptedCatalog = state.catalog.value
  resolveWeekly({ ...calibrated(), revision: 1000 })
  resolveCatalog({ revision: 1000, items: [localMutatorCatalog().items[1]] })
  await flushPromises()
  expect(state.weekly.value).toEqual(acceptedWeekly)
  expect(state.catalog.value).toEqual(acceptedCatalog)
})
test.each(['NO_SCHEDULE', 'OUTSIDE_VALIDITY'])(
  'unavailable calibration %s and empty catalog cannot erase local data',
  async (reason) => {
    mocks.weekly.mockResolvedValue({ available: false, reason })
    mocks.catalog.mockResolvedValue({ revision: 999, items: [] })
    const { state, failure } = setup()
    await flushPromises()
    expect(state.current.value).toEqual(localWeeklyMutation())
    expect(state.catalog.value).toEqual(localMutatorCatalog())
    expect(failure).not.toHaveBeenCalled()
  },
)
test('expired calibration does not replace a current local schedule', async () => {
  const stale = calibrated()
  if (!stale.available) throw new Error('Expected schedule')
  mocks.weekly.mockResolvedValue({ ...stale, endsAt: new Date(Date.now() - 1).toISOString() })
  const { state } = setup()
  await flushPromises()
  expect(state.current.value).toEqual(localWeeklyMutation())
})
test('cross-week automatically recomputes local data while disabled', async () => {
  useContentCenterStore().officialServicesEnabled = false
  const { state } = setup()
  const previous = state.current.value!
  await vi.advanceTimersByTimeAsync(Date.parse(previous.endsAt) - Date.now())
  expect(state.current.value).toEqual(localWeeklyMutation())
  expect(state.current.value?.startsAt).toBe(previous.endsAt)
  expect(state.expired.value).toBe(false)
  expect(mocks.weekly).not.toHaveBeenCalled()
})
test('cross-week restores local data before a pending calibration completes', async () => {
  const { state } = setup()
  await flushPromises()
  const previous = state.current.value!
  mocks.weekly.mockReturnValue(new Promise(() => {}))
  await vi.advanceTimersByTimeAsync(Date.parse(previous.endsAt) - Date.now())
  expect(state.current.value).toEqual(localWeeklyMutation())
  expect(state.weeklyLoading.value).toBe(true)
})
test('visibility after a suspended clock advances the local schedule', async () => {
  useContentCenterStore().officialServicesEnabled = false
  const { state } = setup()
  vi.setSystemTime(Date.parse(state.current.value!.endsAt) + 1000)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  expect(state.current.value).toEqual(localWeeklyMutation())
  vi.restoreAllMocks()
})
test('late results after unmount do not update state or show a toast', async () => {
  let reject!: (reason: Error) => void
  mocks.weekly.mockImplementationOnce(
    () =>
      new Promise((_, no) => {
        reject = no
      }),
  )
  const { state, failure, wrapper } = setup()
  const before = state.weekly.value
  wrapper.unmount()
  reject(new Error('late'))
  await flushPromises()
  expect(state.weekly.value).toEqual(before)
  expect(failure).not.toHaveBeenCalled()
})
test('late previous-server response does not replace a newly selected server', async () => {
  let resolve!: (value: unknown) => void
  mocks.weekly.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes
      }),
  )
  const { state } = setup()
  mocks.weekly.mockResolvedValueOnce({ ...calibrated(), region: 'NA' })
  state.region.value = 'NA'
  await flushPromises()
  expect(mocks.weekly).toHaveBeenLastCalledWith('NA', 'zhCN')
  resolve({ ...calibrated(), region: 'CN' })
  await flushPromises()
  expect(state.weekly.value).toMatchObject({ region: 'NA' })
  state.language.value = 'koKR'
  await flushPromises()
  expect(mocks.weekly).toHaveBeenLastCalledWith('NA', 'koKR')
  expect(mocks.catalog).toHaveBeenLastCalledWith('koKR')
})
