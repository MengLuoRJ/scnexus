import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useWeeklyMutations } from '../useWeeklyMutations'
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
const weekly = { available: true, endsAt: '2026-10-26T00:00:00Z' } as WeeklyMutation
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
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime('2026-10-23T00:00:00Z')
  mocks.weekly.mockResolvedValue(weekly)
  mocks.catalog.mockResolvedValue({ revision: 1, items: [] })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.resetAllMocks()
})
test('loads both public resources independently and hides expired schedules without guessing', async () => {
  const { state } = setup()
  await flushPromises()
  expect(state.current.value).toEqual(weekly)
  expect(mocks.catalog).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(3 * 86400000)
  expect(state.current.value).toBeNull()
  expect(state.expired.value).toBe(true)
  expect(mocks.weekly).toHaveBeenCalledOnce()
})
test('catalog failure does not discard the current schedule and a manual retry recovers', async () => {
  mocks.catalog.mockRejectedValueOnce(new Error('offline'))
  const { state, failure } = setup()
  await flushPromises()
  expect(state.current.value).toEqual(weekly)
  expect(state.catalogError.value).toBe(false)
  expect(state.catalog.value?.items.length).toBeGreaterThan(0)
  expect(failure).not.toHaveBeenCalled()
  await state.loadCatalog()
  expect(state.catalogError.value).toBe(false)
  expect(state.catalog.value).toEqual({ revision: 1, items: [] })
})
test('weekly request failure uses the bundled schedule and a successful retry takes precedence', async () => {
  mocks.weekly.mockRejectedValueOnce(new Error('offline'))
  const { state, failure } = setup()
  await flushPromises()
  expect(state.current.value?.available).toBe(true)
  expect(state.weeklyError.value).toBe(false)
  expect(failure).not.toHaveBeenCalled()
  mocks.weekly.mockResolvedValueOnce({ available: false, reason: 'NO_SCHEDULE' })
  await state.loadWeekly()
  expect(state.weekly.value).toEqual({ available: false, reason: 'NO_SCHEDULE' })
  expect(state.current.value).toBeNull()
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
  wrapper.unmount()
  reject(new Error('late'))
  await flushPromises()
  expect(state.weekly.value).toBeNull()
  expect(failure).not.toHaveBeenCalled()
})
