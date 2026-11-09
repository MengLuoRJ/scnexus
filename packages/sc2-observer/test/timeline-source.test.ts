import { expect, test } from 'vitest'
import {
  createAsyncReplayObserver,
  createReplayObserverTimelineSource,
  sampleReplaySpatialTimeline,
} from '../src/index.js'
import { spatialFixture } from './spatial-fixture.js'

test('windowed source matches full-history samples across seeks and retains dead units', async () => {
  const fixture = spatialFixture(60, 30)
  const timeline = {
    ...fixture,
    units: [...fixture.units].reverse().map((unit, index) => ({
      ...unit,
      diedGameLoop: index % 3 === 0 ? unit.startedGameLoop + 80 : null,
    })),
  }
  const source = createReplayObserverTimelineSource(timeline, 128)
  const observer = createAsyncReplayObserver(source)
  let seed = 42
  const loops = [0, 127.5, 128, 129, timeline.durationGameLoops, 0]
  for (let index = 0; index < 100; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    loops.push(seed % timeline.durationGameLoops)
  }
  for (const loop of loops) {
    const state = await observer.seek(loop)
    expect(state.status).toBe('ready')
    expect(state.units).toEqual(sampleReplaySpatialTimeline(timeline, loop))
  }
  observer.dispose()
  source.dispose()
})

test('keyframes retain old position timestamps and the last same-loop cumulative state', async () => {
  const fixture = spatialFixture(1, 2, false)
  const first = fixture.units[0]!.observations[0]!
  const timeline = {
    ...fixture,
    durationGameLoops: 200,
    units: [
      {
        ...fixture.units[0]!,
        observations: [
          first,
          { ...first, gameLoop: 10, unitType: 'Lair' },
          { ...first, gameLoop: 10, unitType: 'Hive' },
        ],
      },
    ],
  }
  const source = createReplayObserverTimelineSource(timeline, 32)
  const window = await source.loadWindow(40, new AbortController().signal)
  expect(window.fromGameLoop).toBe(32)
  expect(window.toGameLoop).toBe(64)
  expect(window.timeline.units[0]!.observations).toHaveLength(1)
  expect(window.timeline.units[0]!.observations[0]).toMatchObject({
    gameLoop: 32,
    kind: 'position',
    unitType: 'Hive',
    positionGameLoop: 0,
  })
  expect(sampleReplaySpatialTimeline(window.timeline, 40)).toEqual(
    sampleReplaySpatialTimeline(timeline, 40),
  )
  expect(Object.isFrozen(window.timeline.units[0]!.observations[0])).toBe(true)
  source.dispose()
})

test('source owns its input and returned windows remain readable after disposal', async () => {
  const fixture = spatialFixture(1, 3, false)
  const units = fixture.units.map((unit) => ({
    ...unit,
    observations: unit.observations.map((item) => ({ ...item })),
  }))
  const source = createReplayObserverTimelineSource({ ...fixture, units }, 32)
  units[0]!.observations[0]!.unitType = 'Changed'
  const window = await source.loadWindow(0, new AbortController().signal)
  expect(window.timeline.units[0]!.observations[0]!.unitType).toBe('Marine')
  source.dispose()
  source.dispose()
  expect(Object.isFrozen(window)).toBe(true)
  expect(window.timeline.units[0]!.unitTag).toBe('0:1')
  await expect(source.loadWindow(0, new AbortController().signal)).rejects.toThrow(/disposed/)
})

test('aborting before the async checkpoint prevents a window from being returned', async () => {
  const source = createReplayObserverTimelineSource(spatialFixture(1, 2))
  const controller = new AbortController()
  const loading = source.loadWindow(0, controller.signal)
  controller.abort()
  await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
  await expect(source.loadWindow(0, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  })
  source.dispose()
})

test('empty zero-duration sources return a valid window', async () => {
  const source = createReplayObserverTimelineSource({ durationGameLoops: 0, units: [] })
  expect(await source.loadWindow(0, new AbortController().signal)).toEqual({
    fromGameLoop: 0,
    toGameLoop: 0,
    timeline: { durationGameLoops: 0, units: [] },
  })
  source.dispose()
})

test.each([0, -1, 0.5, NaN, Infinity])('invalid window sizes are rejected: %s', (size) => {
  expect(() => createReplayObserverTimelineSource(spatialFixture(1, 2), size)).toThrow(
    /positive safe integer/,
  )
})

test.each([-1, NaN, Infinity, 99999])('out-of-range source requests reject: %s', async (loop) => {
  const source = createReplayObserverTimelineSource(spatialFixture(1, 2))
  await expect(source.loadWindow(loop, new AbortController().signal)).rejects.toThrow(
    /inside the replay/,
  )
  source.dispose()
})
