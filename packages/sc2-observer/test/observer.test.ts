import { describe, expect, it, vi } from 'vitest'
import {
  createReplayObserver,
  filterReplayObserverUnits,
  queryReplayObserverEvents,
  sampleReplaySpatialTimeline,
} from '../src/index.js'
import type { ReplayObserverState, ReplayObserverTimeline } from '../src/index.js'

function fixture(): ReplayObserverTimeline {
  const initial = {
    gameLoop: 10,
    unitType: 'Hatchery',
    controlPlayerId: 1,
    upkeepPlayerId: 1,
    completed: false,
    x: 20,
    y: 30,
    positionGameLoop: 10,
  }
  return {
    durationGameLoops: 100,
    units: [
      {
        unitTag: '1:0',
        startedGameLoop: 10,
        diedGameLoop: 60,
        observations: [
          initial,
          { ...initial, gameLoop: 20, completed: true },
          { ...initial, gameLoop: 30, completed: true, controlPlayerId: 2, upkeepPlayerId: 2 },
          {
            ...initial,
            gameLoop: 40,
            completed: true,
            controlPlayerId: 2,
            upkeepPlayerId: 2,
            unitType: 'Lair',
          },
          {
            ...initial,
            gameLoop: 50,
            completed: true,
            controlPlayerId: 2,
            upkeepPlayerId: 2,
            unitType: 'Lair',
            x: 24,
            y: 32,
            positionGameLoop: 50,
          },
        ],
      },
    ],
  }
}

describe('spatial sampling', () => {
  it('does not leak future units, owners, types, completion or positions', () => {
    const observer = createReplayObserver(fixture())
    expect(observer.getState().units).toEqual([])
    observer.selectUnit('1:0')
    expect(observer.getState().selectedUnit).toBeNull()
    expect(observer.seek(10).selectedUnit).toMatchObject({
      alive: true,
      completed: false,
      unitType: 'Hatchery',
      controlPlayerId: 1,
    })
    expect(observer.seek(20).selectedUnit?.completed).toBe(true)
    expect(observer.seek(29).selectedUnit?.controlPlayerId).toBe(1)
    expect(observer.seek(30).selectedUnit).toMatchObject({ controlPlayerId: 2, upkeepPlayerId: 2 })
    expect(observer.seek(39).selectedUnit?.unitType).toBe('Hatchery')
    expect(observer.seek(40).selectedUnit?.unitType).toBe('Lair')
    expect(observer.seek(49).selectedUnit?.position).toEqual({
      x: 20,
      y: 30,
      observedGameLoop: 10,
      ageGameLoops: 39,
    })
    expect(observer.seek(50).selectedUnit?.position).toEqual({
      x: 24,
      y: 32,
      observedGameLoop: 50,
      ageGameLoops: 0,
    })
    expect(observer.seek(59).selectedUnit?.alive).toBe(true)
    expect(observer.seek(60).selectedUnit?.alive).toBe(false)
    expect(observer.seek(15).selectedUnit).toMatchObject({
      completed: false,
      controlPlayerId: 1,
      unitType: 'Hatchery',
      alive: true,
    })
  })

  it('supports missing positions and equal-loop observation ordering', () => {
    const timeline = fixture()
    const unit = timeline.units[0]!
    const observation = unit.observations[0]!
    const units = sampleReplaySpatialTimeline(
      {
        ...timeline,
        units: [
          {
            ...unit,
            observations: [
              { ...observation, x: null, y: null, positionGameLoop: null },
              { ...observation, x: null, y: null, positionGameLoop: null, unitType: 'Drone' },
            ],
          },
        ],
      },
      10,
    )
    expect(units[0]).toMatchObject({ position: null, unitType: 'Drone' })
  })
})

describe('headless querying', () => {
  it('filters temporal ownership, type, and alive state without future knowledge', () => {
    const observer = createReplayObserver(fixture())
    expect(filterReplayObserverUnits(observer.seek(9).units, {})).toEqual([])
    expect(filterReplayObserverUnits(observer.seek(29).units, { playerId: 2 })).toEqual([])
    expect(filterReplayObserverUnits(observer.seek(30).units, { playerId: 2 })).toHaveLength(1)
    expect(filterReplayObserverUnits(observer.seek(39).units, { search: 'LAIR' })).toEqual([])
    const units = observer.seek(40).units
    expect(
      filterReplayObserverUnits(units, { playerId: 2, search: ' laIR ', alive: 'alive' }),
    ).toEqual(units)
    expect(filterReplayObserverUnits(units, { search: '1:0' })).toEqual(units)
    expect(filterReplayObserverUnits(units, { alive: 'dead' })).toEqual([])
    expect(filterReplayObserverUnits(observer.seek(60).units, { alive: 'dead' })).toHaveLength(1)
    expect(filterReplayObserverUnits(observer.seek(59).units, { alive: 'all' })).toHaveLength(1)
  })

  it('distinguishes neutral, unknown and omitted player filters and searches tags case-insensitively', () => {
    const initial = sampleReplaySpatialTimeline(fixture(), 10)[0]!
    const units = Object.freeze([
      Object.freeze({ ...initial, unitTag: 'Neutral:TAG', controlPlayerId: 0 }),
      Object.freeze({ ...initial, unitTag: 'Unknown', unitType: null, controlPlayerId: null }),
      initial,
    ])
    expect(filterReplayObserverUnits(units, {})).toEqual(units)
    expect(filterReplayObserverUnits(units, { playerId: 0 })).toEqual([units[0]])
    expect(filterReplayObserverUnits(units, { playerId: null })).toEqual([units[1]])
    expect(filterReplayObserverUnits(units, { search: 'neutral:tag' })).toEqual([units[0]])
    expect(filterReplayObserverUnits(units, { search: 'missing' })).toEqual([])
    expect(units).toHaveLength(3)
  })

  it('derives cumulative transitions and death without position noise or mutation', () => {
    const timeline = fixture()
    const before = JSON.stringify(timeline)
    expect(queryReplayObserverEvents(timeline)).toEqual([
      { unitTag: '1:0', gameLoop: 10, kind: 'init' },
      { unitTag: '1:0', gameLoop: 20, kind: 'done' },
      { unitTag: '1:0', gameLoop: 30, kind: 'owner' },
      { unitTag: '1:0', gameLoop: 40, kind: 'type' },
      { unitTag: '1:0', gameLoop: 60, kind: 'died' },
    ])
    expect(queryReplayObserverEvents(timeline, 'missing')).toEqual([])
    expect(JSON.stringify(timeline)).toBe(before)
  })

  it('uses explicit parser kinds, keeps same-loop order and records death only once', () => {
    const unit = fixture().units[0]!
    const initial = unit.observations[0]!
    const timeline: ReplayObserverTimeline = {
      durationGameLoops: 100,
      units: [
        {
          ...unit,
          observations: [
            { ...initial, kind: 'born' },
            { ...initial, gameLoop: 20, kind: 'init' },
            { ...initial, gameLoop: 20, kind: 'done' },
            { ...initial, gameLoop: 20, kind: 'type-change' },
            { ...initial, gameLoop: 20, kind: 'owner-change' },
            { ...initial, gameLoop: 50, kind: 'position', completed: true },
            { ...initial, gameLoop: 60, kind: 'died' },
          ],
        },
        {
          ...unit,
          unitTag: 'second',
          diedGameLoop: null,
          observations: [{ ...initial, kind: 'born' }],
        },
      ],
    }
    const events = queryReplayObserverEvents(timeline)
    expect(events.map(({ kind }) => kind)).toEqual([
      'born',
      'born',
      'init',
      'done',
      'type',
      'owner',
      'died',
    ])
    expect(queryReplayObserverEvents(timeline, '1:0')).toEqual(
      events.filter((event) => event.unitTag === '1:0'),
    )
    expect(Object.isFrozen(events)).toBe(true)
    expect(Object.isFrozen(events[0])).toBe(true)
  })

  it('does not invent unseen starts or completion and handles equal-loop cumulative changes', () => {
    const unit = fixture().units[0]!
    const initial = { ...unit.observations[0]!, completed: true }
    const events = queryReplayObserverEvents({
      durationGameLoops: 100,
      units: [
        { ...unit, diedGameLoop: null, observations: [initial] },
        {
          ...unit,
          unitTag: 'partial',
          diedGameLoop: null,
          observations: [
            { ...initial, gameLoop: 20 },
            { ...initial, gameLoop: 20, unitType: 'Lair', upkeepPlayerId: 0 },
          ],
        },
        { ...unit, unitTag: 'death-only', observations: [] },
      ],
    })
    expect(events).toEqual([
      { unitTag: '1:0', gameLoop: 10, kind: 'born' },
      { unitTag: 'partial', gameLoop: 20, kind: 'type' },
      { unitTag: 'partial', gameLoop: 20, kind: 'owner' },
      { unitTag: 'death-only', gameLoop: 60, kind: 'died' },
    ])
  })
})

describe('externally driven playback', () => {
  it('advances only when playing, scales speed, clamps and stops at endpoint', () => {
    const observer = createReplayObserver(fixture())
    expect(observer.advance(10).currentGameLoop).toBe(0)
    observer.play()
    observer.setSpeed(2)
    expect(observer.advance(10).currentGameLoop).toBe(20)
    observer.pause()
    expect(observer.advance(10).currentGameLoop).toBe(20)
    observer.play()
    expect(observer.advance(100)).toMatchObject({ currentGameLoop: 100, playing: false })
    expect(observer.play().playing).toBe(false)
    expect(observer.seek(-10).currentGameLoop).toBe(0)
    observer.play()
    expect(observer.seek(200)).toMatchObject({ currentGameLoop: 100, playing: false })
    expect(createReplayObserver({ durationGameLoops: 0, units: [] }).play().playing).toBe(false)
  })

  it('retains fractional loops deterministically', () => {
    const observer = createReplayObserver(fixture())
    observer.setSpeed(0.5)
    observer.play()
    expect(observer.advance(3).currentGameLoop).toBe(1.5)
  })

  it('unsubscribes, disposes idempotently and retains immutable final snapshot', () => {
    const observer = createReplayObserver(fixture())
    const listener = vi.fn<(state: ReplayObserverState) => void>()
    const unsubscribe = observer.subscribe(listener)
    observer.seek(10)
    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0]![0]).toBe(observer.getState())
    unsubscribe()
    unsubscribe()
    observer.seek(20)
    expect(listener).toHaveBeenCalledOnce()
    const final = observer.getState()
    expect(Object.isFrozen(final)).toBe(true)
    expect(Object.isFrozen(final.units[0]?.position)).toBe(true)
    observer.dispose()
    observer.dispose()
    expect(observer.getState()).toBe(final)
    expect(() => observer.play()).toThrow('disposed')
    expect(() => observer.subscribe(listener)).toThrow('disposed')
  })

  it('snapshots its input', () => {
    const input = fixture()
    const observer = createReplayObserver(input)
    Object.assign(input.units[0]!.observations[0]!, { x: 999 })
    expect(observer.seek(10).units[0]?.position?.x).toBe(20)
  })

  it('validates numeric controls and unknown selection', () => {
    const observer = createReplayObserver(fixture())
    for (const invalid of [NaN, Infinity, -Infinity])
      expect(() => observer.seek(invalid)).toThrow(RangeError)
    for (const invalid of [NaN, Infinity, -1])
      expect(() => observer.advance(invalid)).toThrow(RangeError)
    for (const invalid of [NaN, Infinity, 0, -1])
      expect(() => observer.setSpeed(invalid)).toThrow(RangeError)
    expect(() => observer.selectUnit('unknown')).toThrow(RangeError)
    expect(observer.selectUnit(null).selectedUnit).toBeNull()
  })

  it('rejects invalid timeline duration, chronology, duplicate tags and positions', () => {
    const timeline = fixture()
    const unit = timeline.units[0]!
    const observation = unit.observations[0]!
    expect(() => createReplayObserver({ ...timeline, durationGameLoops: NaN })).toThrow(
      'durationGameLoops',
    )
    expect(() => createReplayObserver({ ...timeline, units: [unit, unit] })).toThrow('Unit tags')
    for (const observations of [
      [{ ...observation, gameLoop: 9 }],
      [{ ...observation, x: NaN }],
      [{ ...observation, positionGameLoop: 11 }],
      [{ ...observation, y: null }],
    ])
      expect(() =>
        createReplayObserver({ ...timeline, units: [{ ...unit, observations }] }),
      ).toThrow(Error)
  })
})
