import { afterEach, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createReplayObserverTimelineSource } from '@scnexus/sc2-observer'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'
import type { ReplayObserverDataSource, ReplayObserverWindow } from '@scnexus/sc2-observer'
import ReplayObserver from '../ReplayObserver.vue'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import zhHant from '../../../locales/zh-Hant'

const initial = {
  gameLoop: 0,
  kind: 'born' as const,
  unitType: 'Marine',
  controlPlayerId: 1,
  upkeepPlayerId: 1,
  completed: true,
  x: 1,
  y: 2,
  positionGameLoop: 0,
}
const timeline = {
  version: 1 as const,
  baseBuild: 98310,
  durationGameLoops: 3200,
  partial: false,
  diagnostics: [],
  units: [
    {
      unitTag: '1:1',
      unitTagIndex: 1,
      unitTagRecycle: 1,
      startedGameLoop: 0,
      diedGameLoop: null,
      observations: [
        initial,
        {
          ...initial,
          gameLoop: 1600,
          kind: 'owner-change' as const,
          controlPlayerId: 2,
          upkeepPlayerId: 2,
          x: 100,
          positionGameLoop: 1600,
        },
      ],
    },
    {
      unitTag: '2:1',
      unitTagIndex: 2,
      unitTagRecycle: 1,
      startedGameLoop: 2000,
      diedGameLoop: null,
      observations: [{ ...initial, gameLoop: 2000, unitType: 'Zealot', positionGameLoop: 2000 }],
    },
  ],
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
async function windowAt(loop: number) {
  const source = createReplayObserverTimelineSource(timeline, 100)
  try {
    return await source.loadWindow(loop, new AbortController().signal)
  } finally {
    source.dispose()
  }
}
const wrappers: ReturnType<typeof mount>[] = []
function render(source: ReplayObserverDataSource, locale: 'en' | 'zh' | 'zh-Hant' = 'en') {
  const wrapper = mount(ReplayObserver, {
    props: { timeline, source },
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { en, zh, 'zh-Hant': zhHant } })],
      stubs: { UButton: { template: '<button><slot /></button>' }, UInput: true },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
function source() {
  return { durationGameLoops: 3200, loadWindow: vi.fn<ReplayObserverDataSource['loadWindow']>() }
}
function button(wrapper: ReturnType<typeof render>, text: string) {
  return wrapper.findAll('button').find((item) => item.text() === text)!
}
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
})

test.each(['en', 'zh', 'zh-Hant'] as const)(
  'initial loading can be cancelled and restarted (%s)',
  async (locale) => {
    const messages = { en, zh, 'zh-Hant': zhHant }[locale]
    const pending = deferred<ReplayObserverWindow>()
    const data = { ...source(), dispose: vi.fn<() => void>() }
    data.loadWindow.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(await windowAt(0))
    const wrapper = render(data, locale)
    expect(wrapper.get('tbody').text()).toContain(messages['replay.observer.notLoaded'])
    expect(wrapper.text()).not.toContain(messages['replay.observer.count'].replace('{count}', '0'))
    expect(wrapper.get('[role="status"]').text()).toContain(messages['replay.observer.cancelLoad'])
    await button(wrapper, messages['replay.observer.cancelLoad']).trigger('click')
    expect(data.loadWindow.mock.calls[0]![1].aborted).toBe(true)
    expect(wrapper.text()).toContain(messages['replay.observer.notLoaded'])
    pending.reject(new Error('cancelled'))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await button(wrapper, messages['replay.observer.loadFrame']).trigger('click')
    await flushPromises()
    expect(wrapper.get('tbody').text()).toContain('Marine')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('replay.observer.')
    wrapper.unmount()
    expect(data.dispose).not.toHaveBeenCalled()
    wrappers.pop()
  },
)

test('failed seeks retain the committed frame and retry the requested time', async () => {
  const data = source()
  data.loadWindow
    .mockResolvedValueOnce(await windowAt(0))
    .mockRejectedValueOnce(new Error('internal resource path'))
    .mockResolvedValueOnce(await windowAt(1650))
  const wrapper = render(data)
  await flushPromises()
  await wrapper.get('input[type="range"]').setValue('1650')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain(en['replay.observer.loadFailed'])
  expect(wrapper.text()).not.toContain('internal resource path')
  expect(wrapper.text()).toContain('0 / 3200')
  expect(wrapper.get('tbody').text()).toContain('1, 2')
  await button(wrapper, en['replay.observer.retryLoad']).trigger('click')
  await flushPromises()
  expect(data.loadWindow.mock.calls.map(([loop]) => loop)).toEqual([0, 1650, 1650])
  expect(wrapper.text()).toContain('1650 / 3200')
  expect(wrapper.get('tbody').text()).toContain('100, 2')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

test.each([
  [ERRORS.REPLAY_OBSERVER_STALE.code, 'replay.observer.refreshAnalysis'],
  [ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code, 'replay.observer.refreshAnalysis'],
  [ERRORS.REPLAY_OBSERVER_LIMIT.code, 'replay.observer.windowLimit'],
] as const)('permanent source failures explain the required action (%s)', async (code, key) => {
  const data = source()
  data.loadWindow.mockRejectedValue({ code })
  const wrapper = render(data)
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain(en[key])
  expect(
    wrapper.findAll('button').some((item) => item.text() === en['replay.observer.retryLoad']),
  ).toBe(false)
})

test('a pending event jump does not overwrite a newer unit selection', async () => {
  const pending = deferred<ReplayObserverWindow>()
  const data = source()
  data.loadWindow.mockResolvedValueOnce(await windowAt(0)).mockReturnValueOnce(pending.promise)
  const wrapper = render(data)
  await flushPromises()
  const event = wrapper.findAll('section li button').find((item) => item.text().includes('#2:1'))!
  await event.trigger('click')
  await wrapper.get('tbody button').trigger('click')
  pending.resolve(await windowAt(2000))
  await flushPromises()
  expect(wrapper.text()).toContain('2000 / 3200')
  expect(wrapper.text()).toContain('Selected unit: 1:1')
  expect(wrapper.text()).not.toContain('Selected unit: 2:1')
})

test('replacing the source aborts the old load and ignores its late result', async () => {
  const pending = deferred<ReplayObserverWindow>()
  const oldSource = source()
  oldSource.loadWindow.mockReturnValue(pending.promise)
  const wrapper = render(oldSource)
  const replacement = source()
  replacement.loadWindow.mockResolvedValue(await windowAt(0))
  await wrapper.setProps({ source: replacement })
  await flushPromises()
  expect(oldSource.loadWindow.mock.calls[0]![1].aborted).toBe(true)
  pending.resolve(await windowAt(2000))
  await flushPromises()
  expect(wrapper.text()).toContain('0 / 3200')
  expect(wrapper.get('tbody').text()).not.toContain('Zealot')
})

function clock() {
  let next = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++next
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
  return {
    frames,
    async step(time: number) {
      const [id, callback] = [...frames][0]!
      frames.delete(id)
      callback(time)
      await flushPromises()
    },
  }
}

test('playback resets elapsed time across buffering and cancels scheduled frames on pause', async () => {
  const timer = clock()
  const pending = deferred<ReplayObserverWindow>()
  const data = source()
  data.loadWindow.mockResolvedValueOnce(await windowAt(0)).mockReturnValueOnce(pending.promise)
  const wrapper = render(data)
  await flushPromises()
  await button(wrapper, en['replay.observer.play']).trigger('click')
  expect(timer.frames.size).toBe(1)
  await timer.step(0)
  await timer.step(10000)
  expect(wrapper.find('[role="status"]').exists()).toBe(true)
  expect(timer.frames.size).toBe(0)
  pending.resolve(await windowAt(160))
  await flushPromises()
  expect(timer.frames.size).toBe(1)
  await timer.step(100000)
  expect(wrapper.text()).toContain('160 / 3200')
  await timer.step(100100)
  expect(wrapper.text()).toContain('161 / 3200')
  expect(data.loadWindow).toHaveBeenCalledTimes(2)
  await button(wrapper, en['replay.observer.pause']).trigger('click')
  expect(timer.frames.size).toBe(0)
})

test('retry after a playback read failure uses the buffered target', async () => {
  const timer = clock()
  const data = source()
  data.loadWindow
    .mockResolvedValueOnce(await windowAt(0))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(await windowAt(160))
  const wrapper = render(data)
  await flushPromises()
  await button(wrapper, en['replay.observer.play']).trigger('click')
  await timer.step(0)
  await timer.step(10000)
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect(timer.frames.size).toBe(0)
  await button(wrapper, en['replay.observer.retryLoad']).trigger('click')
  await flushPromises()
  expect(data.loadWindow.mock.calls.map(([loop]) => loop)).toEqual([0, 160, 160])
  expect(wrapper.text()).toContain('160 / 3200')
})
