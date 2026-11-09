import { expect, test } from 'vitest'
import { createReplayObserverEventIndex, queryReplayObserverEvents } from '../src/index.js'
import type { ReplayObserverEventQuery, ReplayObserverTimeline } from '../src/index.js'

function fixture() {
  const observation = (
    gameLoop: number,
    kind: NonNullable<ReplayObserverTimeline['units'][number]['observations'][number]['kind']>,
  ) => ({
    gameLoop,
    kind,
    unitType: 'Marine',
    controlPlayerId: 1,
    upkeepPlayerId: 1,
    completed: true,
    x: null,
    y: null,
    positionGameLoop: null,
  })
  return {
    durationGameLoops: 100,
    units: [
      {
        unitTag: 'a',
        startedGameLoop: 0,
        diedGameLoop: 40,
        observations: [
          observation(0, 'born'),
          observation(10, 'owner-change'),
          observation(10, 'type-change'),
          observation(12, 'position'),
          observation(40, 'died'),
        ],
      },
      {
        unitTag: 'b',
        startedGameLoop: 10,
        diedGameLoop: 40,
        observations: [observation(10, 'init'), observation(20, 'done'), observation(40, 'died')],
      },
    ],
  } satisfies ReplayObserverTimeline
}

test('indexed pagination preserves exact reference order and inclusive time boundaries', () => {
  const timeline = fixture()
  const expected = queryReplayObserverEvents(timeline)
  const index = createReplayObserverEventIndex(timeline)
  expect(index.query()).toEqual({ total: 7, events: expected })
  expect(index.query({ fromGameLoop: 10, toGameLoop: 10 })).toEqual({
    total: 3,
    events: expected.slice(1, 4),
  })
  expect(index.query({ fromGameLoop: 10.5, toGameLoop: 39.5 })).toEqual({
    total: 1,
    events: expected.slice(4, 5),
  })
  expect(index.query({ fromGameLoop: 10, toGameLoop: 40, offset: 2, limit: 2 })).toEqual({
    total: 6,
    events: expected.slice(3, 5),
  })
  expect(index.query({ order: 'desc', offset: 1, limit: 3 })).toEqual({
    total: 7,
    events: [...expected].reverse().slice(1, 4),
  })
  expect(index.query({ limit: 0 })).toEqual({ total: 7, events: [] })
  expect(index.query({ offset: Number.MAX_SAFE_INTEGER })).toEqual({ total: 7, events: [] })
  index.dispose()
})

test('unit, kind and time filters compose without broadening unknown units', () => {
  const index = createReplayObserverEventIndex(fixture())
  expect(
    index.query({ unitTag: 'a', kind: 'died', fromGameLoop: 40, toGameLoop: 40 }).events,
  ).toEqual([{ unitTag: 'a', kind: 'died', gameLoop: 40 }])
  expect(index.query({ kind: 'died' }).total).toBe(2)
  expect(index.query({ unitTag: 'b' }).total).toBe(3)
  expect(index.query({ unitTag: 'unknown' }).total).toBe(0)
  expect(index.query({ unitTag: 'b', kind: 'owner' }).total).toBe(0)
  expect(index.query({ fromGameLoop: 41 }).total).toBe(0)
  index.dispose()
})

test('navigation skips all events at the current loop and respects every filter', () => {
  const index = createReplayObserverEventIndex(fixture())
  expect(index.previous(0)).toBeNull()
  expect(index.next(0)).toEqual({ unitTag: 'a', kind: 'owner', gameLoop: 10 })
  expect(index.previous(10)?.gameLoop).toBe(0)
  expect(index.next(10)?.gameLoop).toBe(20)
  expect(index.previous(10.5)).toEqual({ unitTag: 'b', kind: 'init', gameLoop: 10 })
  expect(index.next(40)).toBeNull()
  expect(index.next(0, { unitTag: 'a', kind: 'died' })?.gameLoop).toBe(40)
  expect(index.previous(40, { kind: 'died' })).toBeNull()
  expect(index.next(10, { toGameLoop: 10 })).toBeNull()
  expect(index.previous(20, { fromGameLoop: 20 })).toBeNull()
  expect(index.previous(100, { fromGameLoop: 10, toGameLoop: 20 })?.gameLoop).toBe(20)
  expect(index.next(0, { fromGameLoop: 20, toGameLoop: 40 })?.gameLoop).toBe(20)
  expect(index.next(0, { unitTag: 'unknown' })).toBeNull()
  index.dispose()
})

test('pages own immutable event snapshots and remain readable after disposal', () => {
  const timeline = fixture()
  const index = createReplayObserverEventIndex(timeline)
  const page = index.query()
  timeline.units[0]!.unitTag = 'changed'
  timeline.units[0]!.observations[0]!.gameLoop = 99
  timeline.units.length = 0
  expect(index.query()).toEqual(page)
  expect(Object.isFrozen(page)).toBe(true)
  expect(Object.isFrozen(page.events)).toBe(true)
  expect(Object.isFrozen(page.events[0])).toBe(true)
  index.dispose()
  index.dispose()
  expect(page.events[0]).toEqual({ unitTag: 'a', kind: 'born', gameLoop: 0 })
  expect(() => index.query()).toThrow(/disposed/)
  expect(() => index.previous(0)).toThrow(/disposed/)
  expect(() => index.next(0)).toThrow(/disposed/)
})

test('empty timelines return empty pages and no navigation targets', () => {
  const index = createReplayObserverEventIndex({ durationGameLoops: 0, units: [] })
  expect(index.query()).toEqual({ total: 0, events: [] })
  expect(index.previous(0)).toBeNull()
  expect(index.next(0)).toBeNull()
  index.dispose()
})

test('large event collections have bounded pages with exact totals', () => {
  const unit = fixture().units[0]!
  const index = createReplayObserverEventIndex({
    durationGameLoops: 100,
    units: Array.from({ length: 400 }, (_, ordinal) => ({ ...unit, unitTag: String(ordinal) })),
  })
  expect(index.query().events).toHaveLength(100)
  const page = index.query({ limit: 1000 })
  expect(page.events).toHaveLength(1000)
  expect(page.total).toBe(1600)
  expect(index.query({ offset: 1500, limit: 1000 }).events).toHaveLength(100)
  index.dispose()
})

test.each<ReplayObserverEventQuery>([
  { fromGameLoop: -1 },
  { toGameLoop: NaN },
  { toGameLoop: Infinity },
  { fromGameLoop: 20, toGameLoop: 10 },
  { offset: -1 },
  { offset: 0.5 },
  { offset: Number.MAX_SAFE_INTEGER + 1 },
  { limit: -1 },
  { limit: 1001 },
  { limit: Infinity },
  { limit: 0.5 },
])('rejects invalid query arguments: %j', (query) => {
  const index = createReplayObserverEventIndex(fixture())
  expect(() => index.query(query)).toThrow(/Event/)
  index.dispose()
})

test.each([-1, NaN, Infinity])('rejects invalid navigation loops: %s', (loop) => {
  const index = createReplayObserverEventIndex(fixture())
  expect(() => index.previous(loop)).toThrow(/finite and nonnegative/)
  expect(() => index.next(loop)).toThrow(/finite and nonnegative/)
  index.dispose()
})
