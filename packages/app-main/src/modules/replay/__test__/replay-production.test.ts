import { describe, expect, it } from 'vitest'
import type {
  ReplayGameEvents,
  ReplayInitData,
  ReplayTrackerEvent,
  ReplayTrackerEvents,
} from '@scnexus/replay-parser'
import { buildReplayInsights } from '../replay-insights'
import type { ReplayProductionContext } from '../replay-production'

const stamp = { baseBuild: 96516, protocolVersion: 'test', algorithmVersion: 'test' }
function event(
  type: string,
  gameLoop: number,
  data: ReplayTrackerEvent['data'],
): ReplayTrackerEvent {
  return { eventType: `NNet.Replay.Tracker.S${type}Event`, eventId: 0, gameLoop, data }
}
function unit(
  type: string,
  gameLoop: number,
  index: number,
  name: string,
  extra: ReplayTrackerEvent['data'] = {},
) {
  return event(type, gameLoop, {
    m_unitTagIndex: index,
    m_unitTagRecycle: 1,
    m_unitTypeName: name,
    m_upkeepPlayerId: 1,
    ...extra,
  })
}
function context(overrides: Partial<ReplayProductionContext> = {}): ReplayProductionContext {
  const initData: ReplayInitData = {
    ...stamp,
    data: {
      m_syncLobbyState: {
        m_gameDescription: { m_gameOptions: { m_cooperative: false } },
        m_lobbyState: { m_slots: [] },
      },
    },
  }
  return {
    gameVersion: '5.0.14.96516',
    playedAt: '2026-01-01T00:00:00Z',
    standardMelee: true,
    initData,
    ...overrides,
  }
}
function project(events: ReplayTrackerEvent[], ctx = context()) {
  const tracker: ReplayTrackerEvents = { ...stamp, events }
  return buildReplayInsights(tracker, [], ctx).players.flatMap((player) => player.production)
}
function cast(loop: number, tag = 5 * 262144 + 1, ability = 723) {
  return {
    eventType: 'NNet.Game.SCmdEvent',
    eventId: 1,
    userId: 0,
    gameLoop: loop,
    data: {
      m_abil: { m_abilLink: ability, m_abilCmdIndex: 0 },
      m_data: { TargetUnit: { m_tag: tag } },
    },
  }
}
function game(events = [cast(900)]): ReplayGameEvents {
  return {
    ...stamp,
    compatibility: { state: 'verified', protocolBuild: 96516, candidateBuilds: [96516] },
    processedEvents: events.length,
    skippedEvents: 0,
    events,
  }
}

describe('production evidence', () => {
  it('pairs same-tag init/done, never pairs another building at the same frame', () => {
    const result = project([
      unit('UnitInit', 100, 1, 'Pylon'),
      unit('UnitInit', 100, 2, 'Gateway'),
      unit('UnitDone', 200, 2, ''),
    ])
    expect(result.filter((row) => row.kind === 'construction-completed')).toEqual([
      expect.objectContaining({
        name: 'Gateway',
        startGameLoop: 100,
        endGameLoop: 200,
        startSource: 'tracker-init',
        timingBasis: 'observed',
      }),
    ])
    expect(result[0]?.endGameLoop).toBeNull()
  })
  it('links Egg type-change by creator index AND recycle, including twin births', () => {
    const result = project([
      unit('UnitBorn', 0, 5, 'Larva'),
      unit('UnitTypeChange', 100, 5, 'Egg'),
      unit('UnitBorn', 380, 6, 'Zergling', {
        m_creatorUnitTagIndex: 5,
        m_creatorUnitTagRecycle: 1,
      }),
      unit('UnitBorn', 380, 7, 'Zergling', {
        m_creatorUnitTagIndex: 5,
        m_creatorUnitTagRecycle: 1,
      }),
      unit('UnitBorn', 400, 8, 'Zergling', {
        m_creatorUnitTagIndex: 5,
        m_creatorUnitTagRecycle: 2,
      }),
    ])
    expect(result.filter((row) => row.startSource === 'tracker-egg')).toHaveLength(2)
    expect(result[0]).toMatchObject({
      startGameLoop: 100,
      endGameLoop: 380,
      timingBasis: 'observed',
    })
    expect(result[2]?.startSource).not.toBe('tracker-egg')
  })
  it('invalidates cancelled, captured and recycled Egg associations', () => {
    for (const transition of [
      unit('UnitDied', 200, 5, ''),
      unit('UnitOwnerChange', 200, 5, '', { m_upkeepPlayerId: 2 }),
      unit('UnitBorn', 200, 5, 'Marine', { m_unitTagRecycle: 2 }),
    ]) {
      const result = project([
        unit('UnitBorn', 0, 5, 'Larva'),
        unit('UnitTypeChange', 100, 5, 'Egg'),
        transition,
        unit('UnitBorn', 400, 6, 'Drone', { m_creatorUnitTagIndex: 5, m_creatorUnitTagRecycle: 1 }),
      ])
      expect(result.at(-1)?.startSource).not.toBe('tracker-egg')
    }
  })
  it('never completes cancelled/recycled construction or carries an observed start to its new owner', () => {
    for (const transition of [
      unit('UnitDied', 200, 5, ''),
      unit('UnitOwnerChange', 200, 5, '', { m_upkeepPlayerId: 2 }),
      unit('UnitBorn', 200, 5, 'Marine', { m_unitTagRecycle: 2 }),
    ]) {
      const result = project([
        unit('UnitInit', 100, 5, 'Pylon'),
        transition,
        unit('UnitDone', 400, 5, ''),
      ])
      expect(result.filter((row) => row.kind === 'construction-completed')).toHaveLength(0)
    }
  })
  it('back-projects only explicit supported melee context and exposes version provenance', () => {
    const marine = [
      unit('UnitBorn', 0, 5, 'Barracks'),
      unit('UnitBorn', 1000, 1, 'Marine', {
        m_creatorUnitTagIndex: 5,
        m_creatorUnitTagRecycle: 1,
      }),
    ]
    expect(project(marine)[0]).toMatchObject({
      startGameLoop: 596.8,
      endGameLoop: 1000,
      timingBasis: 'inferred',
      startSource: 'versioned-duration',
    })
    for (const ctx of [
      context({ standardMelee: false }),
      context({ gameVersion: '5.0.99.99999' }),
      context({ playedAt: null }),
      context({ initData: null }),
      context({ gameVersion: 'bad' }),
    ]) {
      expect(project(marine, ctx)[0]).toMatchObject({
        startGameLoop: null,
        timingBasis: 'unavailable',
        endSource: 'tracker-born',
      })
    }
    const coop = context()
    const lobby = coop.initData!.data.m_syncLobbyState as Record<string, unknown>
    ;(
      lobby.m_gameDescription as { m_gameOptions: { m_cooperative: boolean } }
    ).m_gameOptions.m_cooperative = true
    expect(project(marine, coop)[0]?.startGameLoop).toBeNull()
  })
  it('retains observed production but rejects duration inference for retired build 62848', () => {
    const old = context({ gameVersion: '4.0.2.62848', playedAt: '2018-01-01T00:00:00Z' })
    const carrier = [
      unit('UnitBorn', 0, 5, 'Stargate'),
      unit('UnitBorn', 3000, 1, 'Carrier', {
        m_creatorUnitTagIndex: 5,
        m_creatorUnitTagRecycle: 1,
      }),
    ]
    expect(project(carrier, old)[0]?.startGameLoop).toBeNull()
    expect(project(carrier, old)[0]?.endGameLoop).toBe(3000)
    expect(project(carrier, context({ gameVersion: '4.2.1.62848' }))[0]?.startGameLoop).toBeNull()
    expect(project(carrier)[0]?.startGameLoop).toBeCloseTo(3000 - 1433.6)
    expect(
      project(carrier, context({ playedAt: '2018-01-01T00:00:00Z' }))[0]?.startGameLoop,
    ).toBeNull()
    expect(
      project(carrier, context({ ...old, playedAt: '2026-01-01T00:00:00Z' }))[0]?.startGameLoop,
    ).toBeNull()
    expect(project([unit('UnitBorn', 10, 1, 'Marine')])[0]?.startGameLoop).toBeNull()
  })
  it('emits only known irreversible morph transitions, not siege/flight mode switches', () => {
    const result = project([
      unit('UnitBorn', 0, 5, 'Hatchery'),
      unit('UnitTypeChange', 2000, 5, 'Lair'),
      unit('UnitTypeChange', 4000, 5, 'Hive'),
      unit('UnitBorn', 0, 6, 'SiegeTank'),
      unit('UnitTypeChange', 100, 6, 'SiegeTankSieged'),
    ])
    expect(result.map((row) => row.name)).toEqual(['Lair', 'Hive'])
    expect(result[0]).toMatchObject({
      kind: 'morph-completed',
      endSource: 'tracker-type-change',
      startSource: 'versioned-duration',
    })
  })
  it('isolates indexed casts by full producer tag and orders only the matching group', () => {
    const events = [
      event('PlayerSetup', 0, { m_playerId: 1, m_userId: 0 }),
      unit('UnitBorn', 0, 5, 'Nexus'),
      unit('UnitBorn', 1000, 6, 'Probe', { m_creatorUnitTagIndex: 5, m_creatorUnitTagRecycle: 1 }),
    ]
    const baseline = project(events, context({ gameEvents: game([cast(700), cast(800)]) }))
    const unrelated = Array.from({ length: 1000 }, (_, i) => cast(i, (i + 10) * 262144 + 1))
    expect(
      project(events, context({ gameEvents: game([cast(800), ...unrelated, cast(700)]) })),
    ).toEqual(baseline)
  })
  it('adjusts only exact version ability, full target tag and mapped player/producer evidence', () => {
    const events = [
      event('PlayerSetup', 0, { m_playerId: 1, m_userId: 0 }),
      unit('UnitBorn', 0, 5, 'Nexus'),
      unit('UnitBorn', 1000, 6, 'Probe', { m_creatorUnitTagIndex: 5, m_creatorUnitTagRecycle: 1 }),
    ]
    const adjusted = project(events, context({ gameEvents: game() }))[0]!
    expect(adjusted.startGameLoop).toBeCloseTo(781.2)
    expect(adjusted.chrono).toMatchObject({
      state: 'adjusted',
      castGameLoops: [900],
      abilityLink: 723,
      producerTag: '5/1',
    })
    for (const commands of [
      [cast(900, 5 * 262144 + 2)],
      [cast(900, 5 * 262144 + 1, 724)],
      [cast(1200)],
    ]) {
      expect(
        project(events, context({ gameEvents: game(commands) }))[0]?.startGameLoop,
      ).toBeCloseTo(731.2)
    }
    const unverified = game()
    unverified.compatibility.state = 'unverified'
    expect(project(events, context({ gameEvents: unverified }))[0]?.chrono?.state).toBe(
      'unavailable',
    )
  })
  it('merges overlapping casts and solves a fully accelerated duration, without duplicate speed stacking', () => {
    const events = [
      event('PlayerSetup', 0, { m_playerId: 1, m_userId: 0 }),
      unit('UnitBorn', 0, 5, 'Nexus'),
      unit('UnitBorn', 1000, 6, 'Probe', { m_creatorUnitTagIndex: 5, m_creatorUnitTagRecycle: 1 }),
    ]
    expect(
      project(events, context({ gameEvents: game([cast(700), cast(800)]) }))[0]?.startGameLoop,
    ).toBeCloseTo(820.8)
  })
  it('distinguishes Gateway training from WarpGate without excluding proven Gateway producers', () => {
    for (const [producer, inferred] of [
      ['Gateway', true],
      ['WarpGate', false],
    ] as const) {
      const row = project([
        unit('UnitBorn', 0, 5, producer),
        unit('UnitBorn', 2000, 6, 'Stalker', {
          m_creatorUnitTagIndex: 5,
          m_creatorUnitTagRecycle: 1,
        }),
      ])[0]!
      expect(row.timingBasis).toBe(inferred ? 'inferred' : 'unavailable')
      expect(row.startGameLoop).toBe(inferred ? 1395.2 : null)
    }
  })
  it('keeps parallel reactor-parent births independent and accepts tracker SCV producer names', () => {
    const result = project([
      unit('UnitBorn', 0, 5, 'Barracks'),
      unit('UnitBorn', 0, 8, 'OrbitalCommand'),
      unit('UnitBorn', 1000, 6, 'Marine', { m_creatorUnitTagIndex: 5, m_creatorUnitTagRecycle: 1 }),
      unit('UnitBorn', 1000, 7, 'Marine', { m_creatorUnitTagIndex: 5, m_creatorUnitTagRecycle: 1 }),
      unit('UnitBorn', 1000, 9, 'SCV', { m_creatorUnitTagIndex: 8, m_creatorUnitTagRecycle: 1 }),
    ])
    expect(result.map((row) => row.startGameLoop)).toEqual([596.8, 596.8, 731.2])
    expect(result.every((row) => row.chrono?.state === 'unavailable')).toBe(true)
  })
  it('requires a live same-owner completed producer with enough lifetime for the inferred duration', () => {
    for (const extra of [{ m_creatorUnitTagRecycle: 2 }, { m_upkeepPlayerId: 2 }]) {
      const result = project([
        unit('UnitBorn', 0, 5, 'Barracks'),
        unit('UnitBorn', 1000, 6, 'Marine', {
          m_creatorUnitTagIndex: 5,
          m_creatorUnitTagRecycle: 1,
          ...extra,
        }),
      ])
      expect(result.at(-1)?.startGameLoop).toBeNull()
    }
    for (const producer of [
      unit('UnitInit', 100, 5, 'Barracks'),
      unit('UnitBorn', 900, 5, 'Barracks'),
    ]) {
      expect(
        project([
          producer,
          unit('UnitBorn', 1000, 6, 'Marine', {
            m_creatorUnitTagIndex: 5,
            m_creatorUnitTagRecycle: 1,
          }),
        ]).at(-1)?.startGameLoop,
      ).toBeNull()
    }
  })
  it('does not lose starts on duplicate owner/type notifications, but clears cancelled construction', () => {
    expect(
      project([
        unit('UnitInit', 100, 5, 'Pylon'),
        unit('UnitOwnerChange', 150, 5, '', { m_upkeepPlayerId: 1 }),
        unit('UnitTypeChange', 150, 5, 'Pylon'),
        unit('UnitDone', 200, 5, ''),
      ]).at(-1)?.startGameLoop,
    ).toBe(100)
    expect(
      project([
        unit('UnitInit', 100, 5, 'SpawningPool'),
        unit('UnitTypeChange', 150, 5, 'Drone'),
        unit('UnitDone', 200, 5, ''),
      ]).filter((row) => row.kind === 'construction-completed'),
    ).toHaveLength(0)
  })
  it('rejects contradictory chrono owner snapshots and commands before a capture or type change', () => {
    const events = [
      event('PlayerSetup', 0, { m_playerId: 1, m_userId: 0 }),
      unit('UnitBorn', 0, 5, 'Nexus'),
      unit('UnitBorn', 1000, 6, 'Probe', { m_creatorUnitTagIndex: 5, m_creatorUnitTagRecycle: 1 }),
    ]
    const command = cast(900)
    const contradictory = {
      ...command,
      data: {
        ...command.data,
        m_data: {
          TargetUnit: { m_tag: 5 * 262144 + 1, m_snapshotUpkeepPlayerId: 2 },
        },
      },
    }
    expect(
      project(events, context({ gameEvents: game([contradictory]) }))[0]?.startGameLoop,
    ).toBeCloseTo(731.2)
    const mismatched = game()
    mismatched.baseBuild = 62848
    expect(project(events, context({ gameEvents: mismatched }))[0]?.chrono?.state).toBe(
      'unavailable',
    )
    const captured = [
      events[0]!,
      unit('UnitBorn', 0, 5, 'Nexus', { m_upkeepPlayerId: 2 }),
      unit('UnitOwnerChange', 800, 5, '', { m_upkeepPlayerId: 1 }),
      events[2]!,
    ]
    expect(
      project(captured, context({ gameEvents: game([cast(700)]) })).at(-1)?.startGameLoop,
    ).toBeNull()
  })
  it('leaves unknown/mod names and ambiguous warp-in timing unavailable without invented costs', () => {
    const result = project([
      unit('UnitBorn', 2000, 1, 'CustomMarine'),
      unit('UnitBorn', 2000, 2, 'Stalker'),
    ])
    expect(result.every((row) => row.startGameLoop === null)).toBe(true)
    expect(result.every((row) => !('minerals' in row))).toBe(true)
  })
})
