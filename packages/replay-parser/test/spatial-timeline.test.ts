import { describe, expect, it } from 'vitest'
import { buildReplaySpatialTimeline } from '../src/index.js'
import type { ReplayTrackerEvent, ReplayTrackerEvents } from '../src/index.js'

function event(
  name: string,
  gameLoop: number,
  data: ReplayTrackerEvent['data'] = {},
): ReplayTrackerEvent {
  return { eventId: 1, eventType: `NNet.Replay.Tracker.SUnit${name}Event`, gameLoop, data }
}
function tracker(events: ReplayTrackerEvent[], baseBuild = 98310): ReplayTrackerEvents {
  return {
    baseBuild,
    protocolVersion: 'test',
    algorithmVersion: 'test',
    decoderStrategy: 'self-describing-versioned',
    unknownEventIds: [],
    skippedEvents: 0,
    warnings: [],
    events,
  } as ReplayTrackerEvents
}
const identity = { m_unitTagIndex: 10, m_unitTagRecycle: 2 }
const birth = {
  ...identity,
  m_unitTypeName: { kind: 'blob' as const, hex: '61', text: 'Marine' },
  m_controlPlayerId: 1,
  m_upkeepPlayerId: 1,
  m_x: 4,
  m_y: 6,
}

describe('spatial tracker timeline', () => {
  it('retains temporal type, ownership, completion and last-known position without interpolation', () => {
    const result = buildReplaySpatialTimeline(
      tracker([
        event('Init', 1, birth),
        event('Done', 2, identity),
        event('OwnerChange', 3, { ...identity, m_controlPlayerId: 2, m_upkeepPlayerId: 3 }),
        event('TypeChange', 4, {
          ...identity,
          m_unitTypeName: { kind: 'blob', hex: '62', text: 'Marauder' },
        }),
        event('Positions', 8, { m_firstUnitIndex: 8, m_items: [2, 20, 30] }),
        event('Died', 10, { ...identity, m_x: 21, m_y: 31 }),
        event('Done', 11, identity),
      ]),
      20,
    )
    const unit = result.units[0]!
    expect(unit.unitTag).toBe('10:2')
    expect(unit.diedGameLoop).toBe(10)
    expect(result.durationGameLoops).toBe(20)
    expect(unit.observations.map((o) => o.gameLoop)).toEqual([1, 2, 3, 4, 8, 10])
    expect(unit.observations[0]).toMatchObject({
      unitType: 'Marine',
      completed: false,
      controlPlayerId: 1,
    })
    expect(unit.observations[3]).toMatchObject({
      unitType: 'Marauder',
      completed: true,
      controlPlayerId: 2,
      upkeepPlayerId: 3,
      x: 4,
      y: 6,
      positionGameLoop: 1,
    })
    expect(unit.observations[4]).toMatchObject({ x: 20, y: 30, positionGameLoop: 8 })
    expect(result.diagnostics).toContainEqual({ code: 'terminal-unit', gameLoop: 11 })
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('uses cumulative delta indices and recycle identity; scales historical coordinates', () => {
    const result = buildReplaySpatialTimeline(
      tracker(
        [
          event('Born', 0, birth),
          event('Born', 0, { ...birth, m_unitTagIndex: 12 }),
          event('Positions', 1, { m_firstUnitIndex: 8, m_items: [2, 1, 2, 2, 3, 4] }),
          event('Died', 2, { ...identity, m_x: 2, m_y: 3 }),
          event('Born', 3, { ...birth, m_unitTagRecycle: 3 }),
          event('Positions', 4, { m_firstUnitIndex: 10, m_items: [0, 8, 9] }),
        ],
        27949,
      ),
    )
    expect(result.partial).toBe(false)
    expect(result.units.map((u) => u.unitTag)).toEqual(['10:2', '12:2', '10:3'])
    expect(result.units[0]!.observations[0]).toMatchObject({ x: 16, y: 24 })
    expect(result.units[1]!.observations[1]).toMatchObject({ x: 12, y: 16 })
    expect(result.units[2]!.observations[1]).toMatchObject({ x: 32, y: 36 })
    expect(
      buildReplaySpatialTimeline(tracker([event('Born', 0, birth)], 27950)).units[0]!
        .observations[0]!.x,
    ).toBe(4)
  })

  it('marks incomplete and malformed streams without inventing units', () => {
    const input = tracker([
      event('Done', 0, identity),
      event('Positions', 1, { m_firstUnitIndex: 0, m_items: [10, 1, 2] }),
      event('Positions', 2, { m_firstUnitIndex: 0, m_items: [1] }),
      event('Born', 3, { ...birth, m_unitTagIndex: Number.MAX_SAFE_INTEGER + 1 }),
      event('Teleport', 4),
      event('Born', 5, birth),
      event('Born', 6, birth),
      event('TypeChange', 7, { ...identity, m_unitTypeName: 123 }),
      event('Done', 6, identity),
      event('Done', NaN, identity),
    ])
    input.skippedEvents = 1
    const result = buildReplaySpatialTimeline(input)
    expect(result.partial).toBe(true)
    expect(result.units).toHaveLength(1)
    expect(result.units[0]!.observations.at(-1)!.unitType).toBe('Marine')
    expect(result.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining([
        'incomplete-tracker',
        'unknown-unit',
        'malformed-event',
        'unsupported-event',
        'duplicate-unit',
      ]),
    )
    expect(() => buildReplaySpatialTimeline(input, Infinity)).toThrow(RangeError)
  })

  it('rejects unsafe deltas and coordinates without corrupting last location', () => {
    const result = buildReplaySpatialTimeline(
      tracker(
        [
          event('Born', 1, birth),
          event('Positions', 1, { m_firstUnitIndex: 10, m_items: [0, Number.MAX_SAFE_INTEGER, 2] }),
          event('Positions', 2, { m_firstUnitIndex: Number.MAX_SAFE_INTEGER, m_items: [1, 1, 2] }),
          event('Positions', 3, { m_firstUnitIndex: 10, m_items: [0, -1, 2] }),
          event('Done', 4, identity),
        ],
        27949,
      ),
    )
    expect(result.units[0]!.observations).toHaveLength(2)
    expect(result.units[0]!.observations[1]).toMatchObject({ x: 16, y: 24, positionGameLoop: 1 })
    expect(result.partial).toBe(true)
  })

  it('bounds diagnostics, units, observations and position processing', () => {
    const unknown = event('Done', 0, identity)
    const result = buildReplaySpatialTimeline(
      tracker(Array.from({ length: 100001 }, () => unknown)),
    )
    expect(result.diagnostics).toHaveLength(256)
    expect(result.diagnostics[0]!.code).toBe('budget-exceeded')
    const many = buildReplaySpatialTimeline(
      tracker(
        Array.from({ length: 50001 }, (_, i) => event('Born', i, { ...birth, m_unitTagIndex: i })),
      ),
    )
    expect(many.units).toHaveLength(50000)
    expect(many.partial).toBe(true)
    const positions = buildReplaySpatialTimeline(
      tracker([
        event('Born', 0, birth),
        event('Positions', 1, {
          m_firstUnitIndex: 10,
          m_items: Array.from({ length: 200001 }, () => [0, 1, 2]).flat(),
        }),
      ]),
    )
    expect(positions.units[0]!.observations).toHaveLength(200000)
    expect(positions.partial).toBe(true)
  })
})
