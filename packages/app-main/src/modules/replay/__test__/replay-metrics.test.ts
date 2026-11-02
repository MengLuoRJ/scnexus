import { describe, expect, it } from 'vitest'
import type {
  ReplayGameEvent,
  ReplayGameEvents,
  ReplayTrackerEvent,
  ReplayTrackerEvents,
} from '@scnexus/replay-parser'
import type { ReplayPlayer } from '@scnexus/app-shared/types/replay.type'
import { buildReplayMetrics } from '../replay-metrics'
import { buildReplayInsights } from '../replay-insights'

function event(
  type: string,
  gameLoop: number,
  data: ReplayTrackerEvent['data'] = {},
): ReplayTrackerEvent {
  return { eventType: `NNet.Replay.Tracker.S${type}Event`, eventId: 0, gameLoop, data }
}
function tracker(events: ReplayTrackerEvent[]): ReplayTrackerEvents {
  return {
    baseBuild: 98310,
    protocolVersion: 'test',
    algorithmVersion: 'test',
    decoderStrategy: 'tracker-versioned-v1',
    unknownEventIds: [],
    skippedEvents: 0,
    warnings: [],
    events,
  }
}
function setup(player: number, user: number, slot: number): ReplayTrackerEvent {
  return event('PlayerSetup', 0, { m_playerId: player, m_userId: user, m_slotId: slot })
}
function unit(
  type: string,
  loop: number,
  index = 1,
  recycle = 1,
  owner = 1,
  name = 'Marine',
  extra: ReplayTrackerEvent['data'] = {},
): ReplayTrackerEvent {
  return event(type, loop, {
    m_unitTagIndex: index,
    m_unitTagRecycle: recycle,
    m_upkeepPlayerId: owner,
    m_unitTypeName: name,
    ...extra,
  })
}
function action(
  type: string,
  userId = 7,
  gameLoop = 16,
  data: ReplayGameEvent['data'] = {},
): ReplayGameEvent {
  return { eventType: `NNet.Game.S${type}Event`, eventId: 0, userId, gameLoop, data }
}
function game(events: ReplayGameEvent[], duration: number | undefined = 960): ReplayGameEvents {
  return {
    baseBuild: 98310,
    protocolVersion: 'test',
    algorithmVersion: 'test',
    compatibility: { state: 'verified', protocolBuild: 98310, candidateBuilds: [98310] },
    elapsedGameLoops: duration,
    processedEvents: events.length + 10,
    skippedEvents: 10,
    events,
  }
}
const players: ReplayPlayer[] = [
  { slot: 3, name: 'A', team: 1, race: null, result: null },
  { slot: 5, name: 'B', team: 2, race: null, result: null },
]

describe('shared raw replay metrics', () => {
  it('also deduplicates the existing insights production timeline across Init, Done and Born', () => {
    const result = buildReplayInsights(
      tracker([
        unit('UnitInit', 1),
        unit('UnitDone', 2),
        unit('UnitBorn', 3),
        unit('UnitBorn', 4, 2),
        unit('UnitInit', 5, 2),
        unit('UnitDone', 6, 2),
      ]),
      [],
    )
    expect(result.players[0]!.production.map((entry) => entry.kind)).toEqual([
      'construction-started',
      'construction-completed',
      'unit-born',
    ])
  })

  it('separates initial, born, started and completed; deduplicates Born/Init/Done', () => {
    const result = buildReplayMetrics(
      tracker([
        unit('UnitBorn', 0),
        unit('UnitInit', 0, 2),
        unit('UnitDone', 3, 2),
        unit('UnitBorn', 10, 3),
        unit('UnitBorn', 11, 3),
        unit('UnitInit', 12, 3),
        unit('UnitDone', 13, 3),
        unit('UnitInit', 20, 4),
        unit('UnitBorn', 21, 4),
        unit('UnitDone', 22, 4),
        unit('UnitDone', 23, 4),
      ]),
      null,
      [],
    )
    expect(result.players[0]!.units).toEqual([
      { name: 'Marine', initial: 2, born: 1, started: 1, completed: 1, lost: 0, kills: 0 },
    ])
    expect(result.players[0]!.apm.value).toBeNull()
  })

  it('tracks recycle, morph and capture without inventing new production; raw kills include friendly/unknown', () => {
    const result = buildReplayMetrics(
      tracker([
        setup(1, 7, 2),
        setup(2, 0, 4),
        unit('UnitBorn', 1, 9),
        unit('UnitBorn', 2),
        unit('UnitTypeChange', 3, 1, 1, 1, 'Morphed'),
        unit('UnitOwnerChange', 4, 1, 1, 2),
        unit('UnitDied', 5, 1, 1, 2, 'ignored', {
          m_killerPlayerId: 1,
          m_killerUnitTagIndex: 9,
          m_killerUnitTagRecycle: 1,
        }),
        unit('UnitDied', 6, 1, 1, 2, 'ignored', { m_killerPlayerId: 1 }),
        unit('UnitBorn', 7, 1, 2),
        unit('UnitDied', 8, 1, 1, 2),
        unit('UnitDied', 9, 1, 2, 1, 'ignored', { m_killerPlayerId: 1 }),
        unit('UnitDied', 10, 99, 1, 0, 'ignored', { m_killerPlayerId: 1 }),
      ]),
      null,
      players,
    )
    const [a, b] = result.players
    expect(a).toMatchObject({ kills: 3, enemyKills: 1, friendlyKills: 1, unknownKills: 1 })
    expect(a!.units).toEqual([
      { name: 'Marine', initial: 0, born: 3, started: 0, completed: 0, lost: 1, kills: 1 },
    ])
    expect(b!.units).toEqual([
      { name: 'Morphed', initial: 0, born: 0, started: 0, completed: 0, lost: 1, kills: 0 },
    ])
    expect(a!.killTimeline.map((entry) => entry.kills)).toEqual([1, 2, 3])
  })

  it('keeps score army minerals and vespene separate, preserves absent values', () => {
    const result = buildReplayMetrics(
      tracker([
        event('PlayerStats', 10, {
          m_playerId: 1,
          m_stats: {
            m_scoreValueMineralsUsedCurrentArmy: 150,
            m_scoreValueVespeneUsedCurrentArmy: 25,
          },
        }),
        event('PlayerStats', 20, {
          m_playerId: 1,
          m_stats: { m_scoreValueMineralsUsedCurrentArmy: -2 },
        }),
      ]),
      null,
      [],
    )
    expect(result.players[0]!.armyValue).toEqual([
      { gameLoop: 10, minerals: 150, vespene: 25 },
      { gameLoop: 20, minerals: null, vespene: null },
    ])
  })

  it('maps raw users only via setup; uses full stream duration, not last retained action or skippedEvents', () => {
    const result = buildReplayMetrics(
      tracker([setup(1, 7, 2)]),
      game([
        action('Cmd'),
        action('SelectionDelta'),
        ...[0, 1, 2, 3, 4, 5, null].map((m_controlGroupUpdate) =>
          action('ControlGroupUpdate', 7, 16, { m_controlGroupUpdate }),
        ),
      ]),
      players,
    )
    expect(result.players[0]).toMatchObject({
      playerId: 1,
      userId: 7,
      slot: 3,
      name: 'A',
      apm: {
        actions: 5,
        commands: 1,
        selections: 1,
        controlGroups: 3,
        value: 5,
        state: 'available',
      },
    })
  })

  it('retains independent game-only action rows without attributing to metadata slot or tracker player', () => {
    const result = buildReplayMetrics(null, game([action('Cmd', 0)]), players)
    expect(result.players[0]).toMatchObject({
      playerId: null,
      slot: null,
      name: null,
      userId: 0,
      kills: null,
      unitsState: 'unavailable',
      apm: { actions: 1, value: null, state: 'partial' },
    })
  })

  it.each([undefined, 0, -1, NaN])(
    'does not fabricate APM for missing/invalid duration %s',
    (duration) => {
      const input = game([action('Cmd')])
      input.elapsedGameLoops = duration
      const result = buildReplayMetrics(tracker([setup(1, 7, 2)]), input, players)
      expect(result.durationGameLoops).toBeNull()
      expect(result.players[0]!.apm).toMatchObject({ actions: 1, value: null, state: 'partial' })
    },
  )

  it('does not publish a rate for unverified decoding or ambiguous user mappings', () => {
    const input = game([action('Cmd')])
    input.compatibility.state = 'unverified'
    expect(
      buildReplayMetrics(tracker([setup(1, 7, 2)]), input, players).players[0]!.apm.value,
    ).toBeNull()
    const result = buildReplayMetrics(
      tracker([setup(1, 7, 2), setup(2, 7, 4)]),
      game([action('Cmd')]),
      players,
    )
    expect(result.players.find((row) => row.userId === 7)).toMatchObject({
      playerId: null,
      apm: { value: null },
    })
    const many = buildReplayMetrics(
      tracker([setup(1, 7, 2), setup(1, 8, 2)]),
      game([action('Cmd', 7), action('Cmd', 8)]),
      players,
    )
    expect(many.players.filter((row) => row.playerId === null)).toHaveLength(2)
  })

  it('enforces event ceilings and keeps empty missing components honest', () => {
    expect(buildReplayMetrics(null, null, []).players).toEqual([])
    expect(() =>
      buildReplayMetrics(
        tracker(Array.from({ length: 100_001 }, () => unit('UnitBorn', 1))),
        null,
        [],
      ),
    ).toThrow(RangeError)
    expect(() =>
      buildReplayMetrics(null, game(Array.from({ length: 100_001 }, () => action('Cmd'))), []),
    ).toThrow(RangeError)
  })
})
