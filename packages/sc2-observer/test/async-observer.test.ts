import { expect, test, vi } from 'vitest'
import { createAsyncReplayObserver } from '../src/index.js'
import type {
  AsyncReplayObserverState,
  ReplayObserverDataSource,
  ReplayObserverWindow,
} from '../src/index.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function window(fromGameLoop: number, toGameLoop: number): ReplayObserverWindow {
  return {
    fromGameLoop,
    toGameLoop,
    timeline: {
      durationGameLoops: 320,
      units: [0, 160]
        .filter((start) => start <= toGameLoop)
        .map((startedGameLoop, index) => {
          const first = Math.max(fromGameLoop, startedGameLoop)
          const observation = (gameLoop: number) => ({
            gameLoop,
            kind: gameLoop === startedGameLoop ? ('born' as const) : ('position' as const),
            unitType: 'Marine',
            controlPlayerId: 1,
            upkeepPlayerId: 1,
            completed: true,
            x: Math.floor(gameLoop / 20) * 20,
            y: index,
            positionGameLoop: Math.floor(gameLoop / 20) * 20,
          })
          const observations = [observation(first)]
          for (let loop = Math.floor(first / 20) * 20 + 20; loop <= toGameLoop; loop += 20)
            observations.push(observation(loop))
          return { unitTag: `${index}:1`, startedGameLoop, diedGameLoop: null, observations }
        }),
    },
  }
}
function source() {
  return { durationGameLoops: 320, loadWindow: vi.fn<ReplayObserverDataSource['loadWindow']>() }
}

test('initial loading commits immutable samples and reuses one window', async () => {
  const data = source()
  const pending = deferred<ReplayObserverWindow>()
  data.loadWindow.mockReturnValueOnce(pending.promise)
  const observer = createAsyncReplayObserver(data)
  expect(observer.getState()).toMatchObject({
    status: 'idle',
    currentGameLoop: 0,
    availableRange: null,
    units: [],
  })
  expect(data.loadWindow).not.toHaveBeenCalled()
  const loading = observer.seek(45)
  expect(observer.getState()).toMatchObject({
    status: 'loading',
    currentGameLoop: 0,
    requestedGameLoop: 45,
  })
  pending.resolve(window(0, 100))
  const snapshot = await loading
  expect(snapshot).toMatchObject({
    status: 'ready',
    currentGameLoop: 45,
    requestedGameLoop: null,
    availableRange: { fromGameLoop: 0, toGameLoop: 100 },
  })
  expect(snapshot.units[0]?.position).toEqual({
    x: 40,
    y: 0,
    observedGameLoop: 40,
    ageGameLoops: 5,
  })
  expect((await observer.seek(46)).units[0]?.position?.ageGameLoops).toBe(6)
  expect((await observer.seek(-10)).currentGameLoop).toBe(0)
  expect(data.loadWindow).toHaveBeenCalledOnce()
  expect(snapshot.currentGameLoop).toBe(45)
  expect(Object.isFrozen(snapshot.units[0]?.position)).toBe(true)
  observer.dispose()
})

test.each(['resolve', 'reject'] as const)(
  'stale loads that %s cannot overwrite a newer seek',
  async (completion) => {
    const data = source()
    const old = deferred<ReplayObserverWindow>()
    const latest = deferred<ReplayObserverWindow>()
    data.loadWindow.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const observer = createAsyncReplayObserver(data)
    const previous = observer.seek(40)
    const next = observer.seek(200)
    expect(data.loadWindow.mock.calls[0]![1].aborted).toBe(true)
    latest.resolve(window(160, 240))
    const committed = await next
    if (completion === 'resolve') old.resolve(window(0, 100))
    else old.reject(new Error('obsolete failure'))
    expect(await previous).toBe(committed)
    expect(observer.getState()).toMatchObject({
      status: 'ready',
      currentGameLoop: 200,
      error: null,
    })
    observer.dispose()
  },
)

test('buffering preserves play intent but does not accumulate advance calls', async () => {
  const data = source()
  const pending = deferred<ReplayObserverWindow>()
  data.loadWindow.mockResolvedValueOnce(window(0, 100)).mockReturnValueOnce(pending.promise)
  const observer = createAsyncReplayObserver(data)
  await observer.seek(0)
  observer.selectUnit('0:1')
  observer.setSpeed(2)
  observer.play()
  expect((await observer.advance(16)).currentGameLoop).toBe(32)
  const buffering = observer.advance(40)
  expect(observer.getState()).toMatchObject({
    playing: true,
    status: 'loading',
    currentGameLoop: 32,
    requestedGameLoop: 112,
  })
  await observer.advance(100)
  expect(data.loadWindow).toHaveBeenCalledTimes(2)
  observer.pause()
  pending.resolve(window(100, 200))
  expect(await buffering).toMatchObject({
    currentGameLoop: 112,
    playing: false,
    speed: 2,
    selectedUnitTag: '0:1',
  })
  expect((await observer.advance(10)).currentGameLoop).toBe(112)
  observer.dispose()
})

test('selection survives a rewind before the unit exists and returns with a later window', async () => {
  const data = source()
  data.loadWindow
    .mockResolvedValueOnce(window(160, 240))
    .mockResolvedValueOnce(window(0, 100))
    .mockResolvedValueOnce(window(160, 240))
  const observer = createAsyncReplayObserver(data)
  await observer.seek(200)
  observer.selectUnit('1:1')
  const beforeBirth = await observer.seek(40)
  expect(beforeBirth).toMatchObject({ selectedUnitTag: '1:1', selectedUnit: null })
  expect(() => observer.selectUnit('unknown')).toThrow(/Unknown unit tag/)
  expect((await observer.seek(200)).selectedUnit?.unitTag).toBe('1:1')
  observer.selectUnit(null)
  expect(observer.getState().selectedUnit).toBeNull()
  expect(data.loadWindow).toHaveBeenCalledTimes(3)
  observer.dispose()
})

test('window keyframes retain older position observation times', async () => {
  const data = source()
  data.loadWindow.mockResolvedValue(window(101, 159))
  const observer = createAsyncReplayObserver(data)
  const state = await observer.seek(105)
  expect(state.units[0]?.position).toEqual({
    x: 100,
    y: 0,
    observedGameLoop: 100,
    ageGameLoops: 5,
  })
  observer.dispose()
})

test('load failures preserve the committed frame and allow cached recovery and retry', async () => {
  const data = source()
  data.loadWindow
    .mockResolvedValueOnce(window(0, 100))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(window(160, 240))
  const observer = createAsyncReplayObserver(data)
  const initial = await observer.seek(40)
  observer.play()
  expect(await observer.seek(200)).toMatchObject({
    status: 'error',
    currentGameLoop: 40,
    playing: false,
    error: { code: 'load-failed', message: 'offline' },
  })
  expect(observer.getState().units).toBe(initial.units)
  expect(await observer.seek(40)).toMatchObject({ status: 'ready', error: null })
  expect(data.loadWindow).toHaveBeenCalledTimes(2)
  expect(await observer.seek(200)).toMatchObject({
    status: 'ready',
    currentGameLoop: 200,
    error: null,
  })
  observer.dispose()
})

test('cancelling keeps the last window and aborts pending work', async () => {
  const data = source()
  const pending = deferred<ReplayObserverWindow>()
  data.loadWindow.mockResolvedValueOnce(window(0, 100)).mockReturnValueOnce(pending.promise)
  const observer = createAsyncReplayObserver(data)
  await observer.seek(40)
  observer.play()
  const loading = observer.seek(200)
  const cancelled = observer.cancel()
  expect(cancelled).toMatchObject({
    status: 'ready',
    currentGameLoop: 40,
    playing: false,
    requestedGameLoop: null,
  })
  expect(data.loadWindow.mock.calls[1]![1].aborted).toBe(true)
  pending.resolve(window(160, 240))
  expect(await loading).toBe(cancelled)
  expect((await observer.seek(60)).currentGameLoop).toBe(60)
  expect(data.loadWindow).toHaveBeenCalledTimes(2)
  observer.dispose()
})

test('seeking back into the committed window aborts a pending read without another load', async () => {
  const data = source()
  const pending = deferred<ReplayObserverWindow>()
  data.loadWindow.mockResolvedValueOnce(window(0, 100)).mockReturnValueOnce(pending.promise)
  const observer = createAsyncReplayObserver(data)
  await observer.seek(40)
  const loading = observer.seek(200)
  expect(await observer.seek(60)).toMatchObject({ status: 'ready', currentGameLoop: 60 })
  expect(data.loadWindow.mock.calls[1]![1].aborted).toBe(true)
  pending.reject(new Error('obsolete failure'))
  expect(await loading).toMatchObject({ status: 'ready', currentGameLoop: 60, error: null })
  expect(data.loadWindow).toHaveBeenCalledTimes(2)
  observer.dispose()
})

test('an empty zero-duration replay loads once and cannot start playback', async () => {
  const data = {
    durationGameLoops: 0,
    loadWindow: vi.fn<ReplayObserverDataSource['loadWindow']>().mockResolvedValue({
      fromGameLoop: 0,
      toGameLoop: 0,
      timeline: { durationGameLoops: 0, units: [] },
    }),
  }
  const observer = createAsyncReplayObserver(data)
  expect(await observer.seek(999)).toMatchObject({ status: 'ready', currentGameLoop: 0, units: [] })
  expect(observer.play().playing).toBe(false)
  await observer.advance(10)
  expect(data.loadWindow).toHaveBeenCalledOnce()
  observer.dispose()
})

test('cancelling the initial load restores idle without publishing late data', async () => {
  const data = source()
  const pending = deferred<ReplayObserverWindow>()
  data.loadWindow.mockReturnValue(pending.promise)
  const observer = createAsyncReplayObserver(data)
  const loading = observer.seek(40)
  observer.cancel()
  pending.reject(new Error('cancelled'))
  expect(await loading).toMatchObject({ status: 'idle', availableRange: null, units: [] })
  observer.dispose()
})

test('endpoints clamp and playback can resume while seeking back from the end', async () => {
  const data = source()
  const pending = deferred<ReplayObserverWindow>()
  data.loadWindow.mockResolvedValueOnce(window(300, 320)).mockReturnValueOnce(pending.promise)
  const observer = createAsyncReplayObserver(data)
  expect((await observer.seek(999)).currentGameLoop).toBe(320)
  expect(observer.play().playing).toBe(false)
  const loading = observer.seek(20)
  expect(observer.play().playing).toBe(true)
  pending.resolve(window(0, 100))
  expect(await loading).toMatchObject({ currentGameLoop: 20, playing: true })
  observer.dispose()
})

test.each([
  { ...window(0, 100), fromGameLoop: 60 },
  { ...window(0, 100), toGameLoop: 20 },
  { ...window(0, 100), toGameLoop: Infinity },
  { ...window(0, 100), timeline: { ...window(0, 100).timeline, durationGameLoops: 999 } },
  { ...window(0, 100), toGameLoop: 80 },
  {
    ...window(0, 100),
    timeline: {
      ...window(0, 100).timeline,
      units: [...window(0, 100).timeline.units, ...window(0, 100).timeline.units],
    },
  },
])('invalid windows become recoverable errors (%#)', async (invalid) => {
  const data = source()
  data.loadWindow.mockResolvedValueOnce(invalid).mockResolvedValueOnce(window(0, 100))
  const observer = createAsyncReplayObserver(data)
  expect(await observer.seek(40)).toMatchObject({
    status: 'error',
    currentGameLoop: 0,
    error: { code: 'invalid-window' },
  })
  expect(await observer.seek(40)).toMatchObject({ status: 'ready', currentGameLoop: 40 })
  observer.dispose()
})

test('windows require cumulative state for units already present at their start', async () => {
  const data = source()
  const full = window(0, 100)
  data.loadWindow.mockResolvedValue({
    ...full,
    timeline: {
      ...full.timeline,
      units: full.timeline.units.map((unit) => ({
        ...unit,
        observations: unit.observations.slice(1),
      })),
    },
  })
  const observer = createAsyncReplayObserver(data)
  expect(await observer.seek(40)).toMatchObject({
    status: 'error',
    error: { code: 'invalid-window' },
  })
  observer.dispose()
})

test('dispose aborts loads, clears listeners and leaves the last snapshot readable', async () => {
  const data = source()
  const pending = deferred<ReplayObserverWindow>()
  data.loadWindow.mockResolvedValueOnce(window(0, 100)).mockReturnValueOnce(pending.promise)
  const observer = createAsyncReplayObserver(data)
  const initial = await observer.seek(40)
  const listener = vi.fn<(state: AsyncReplayObserverState) => void>()
  observer.subscribe(listener)
  const loading = observer.seek(200)
  observer.dispose()
  observer.dispose()
  expect(data.loadWindow.mock.calls[1]![1].aborted).toBe(true)
  pending.resolve(window(160, 240))
  expect(await loading).toMatchObject({
    status: 'disposed',
    currentGameLoop: 40,
    playing: false,
    availableRange: null,
  })
  expect(observer.getState().units).toBe(initial.units)
  expect(listener).toHaveBeenCalledOnce()
  expect(() => observer.play()).toThrow(/disposed/)
  expect(() => observer.cancel()).toThrow(/disposed/)
  await expect(observer.seek(0)).rejects.toThrow(/disposed/)
  await expect(observer.advance(1)).rejects.toThrow(/disposed/)
})

test('listeners can cancel a pending seek before the source is invoked', async () => {
  const data = source()
  const observer = createAsyncReplayObserver(data)
  const unsubscribe = observer.subscribe((state) => {
    if (state.status === 'loading') observer.cancel()
  })
  expect(await observer.seek(40)).toMatchObject({ status: 'idle', requestedGameLoop: null })
  expect(data.loadWindow).not.toHaveBeenCalled()
  unsubscribe()
  unsubscribe()
  observer.dispose()
})

test('a newer seek started by an abort listener supersedes the aborting seek', async () => {
  const data = source()
  const old = deferred<ReplayObserverWindow>()
  const latest = deferred<ReplayObserverWindow>()
  data.loadWindow.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
  const observer = createAsyncReplayObserver(data)
  const initial = observer.seek(40)
  let reentrant!: Promise<AsyncReplayObserverState>
  data.loadWindow.mock.calls[0]![1].addEventListener(
    'abort',
    () => {
      reentrant = observer.seek(240)
    },
    { once: true },
  )
  await observer.seek(200)
  expect(data.loadWindow.mock.calls.map(([loop]) => loop)).toEqual([40, 240])
  latest.resolve(window(200, 300))
  expect(await reentrant).toMatchObject({ currentGameLoop: 240, status: 'ready' })
  old.resolve(window(0, 100))
  await initial
  observer.dispose()
})

test('invalid arguments reject before starting or replacing a load', async () => {
  const data = source()
  expect(() => createAsyncReplayObserver({ ...data, durationGameLoops: Infinity })).toThrow(
    /finite and nonnegative/,
  )
  const observer = createAsyncReplayObserver(data)
  await expect(observer.seek(NaN)).rejects.toThrow(/finite/)
  await expect(observer.advance(-1)).rejects.toThrow(/finite and nonnegative/)
  expect(() => observer.setSpeed(0)).toThrow(/finite and positive/)
  expect(data.loadWindow).not.toHaveBeenCalled()
  observer.dispose()
})
