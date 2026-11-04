import { describe, expect, it } from 'vitest'
import type { ReplayTrackerEvent, ReplayTrackerEvents } from '@scnexus/replay-parser'
import type { ReplayPlayer } from '@scnexus/app-shared/types/replay.type'
import { buildReplayInsights, REPLAY_INSIGHTS_VERSION } from '../replay-insights'

function event(
  type: string,
  gameLoop: number,
  data: ReplayTrackerEvent['data'],
): ReplayTrackerEvent {
  return { eventType: `NNet.Replay.Tracker.S${type}Event`, eventId: 0, gameLoop, data }
}
function tracker(events: ReplayTrackerEvent[]): ReplayTrackerEvents {
  return { baseBuild: 98310, protocolVersion: 's2protocol-98310', algorithmVersion: 'test', events }
}
function player(slot: number, name: string, team = 1): ReplayPlayer {
  return { slot, name, team, race: null, result: null }
}
function setup(id: number, slot: number | null, userId: number | null = null): ReplayTrackerEvent {
  return event('PlayerSetup', 0, { m_playerId: id, m_slotId: slot, m_userId: userId, m_type: 1 })
}
function unit(
  type: string,
  loop: number,
  index = 5,
  recycle = 1,
  owner = 1,
  name = 'Pylon',
): ReplayTrackerEvent {
  return event(type, loop, {
    m_unitTagIndex: index,
    m_unitTagRecycle: recycle,
    m_upkeepPlayerId: owner,
    m_controlPlayerId: 9,
    m_unitTypeName: name,
  })
}

const stats = {
  m_scoreValueMineralsCurrent: 430,
  m_scoreValueVespeneCurrent: 72,
  m_scoreValueMineralsCollectionRate: 875,
  m_scoreValueVespeneCollectionRate: 163,
  m_scoreValueWorkersActiveCount: 24,
  m_scoreValueFoodUsed: 49152,
  m_scoreValueFoodMade: 57344,
  m_scoreValueMineralsUsedCurrentArmy: 850,
  m_scoreValueVespeneUsedCurrentArmy: 125,
}

describe('replay tracker business projection', () => {
  it('reads actual parser blob text for entity and upgrade IDs without leaking blob structures', () => {
    const result = buildReplayInsights(
      tracker([
        event('UnitBorn', 12, {
          m_upkeepPlayerId: 1,
          m_unitTypeName: { kind: 'blob', hex: '4d6172696e65', text: 'Marine' },
        }),
        event('Upgrade', 13, {
          m_playerId: 1,
          m_upgradeTypeName: { kind: 'blob', hex: '58', text: 'X' },
          m_count: 1,
        }),
        event('UnitBorn', 14, {
          m_upkeepPlayerId: 1,
          m_unitTypeName: { kind: 'blob', hex: 'ff', text: null },
        }),
      ]),
      [],
    )
    expect(result.players[0]!.production).toEqual([
      { gameLoop: 12, kind: 'unit-born', name: 'Marine', count: 1 },
      { gameLoop: 13, kind: 'upgrade-completed', name: 'X', count: 1 },
    ])
  })

  it('uses actual score fields, recorded per-minute income and fixed-point food, not raw data', () => {
    const result = buildReplayInsights(
      tracker([setup(1, 0, 4), event('PlayerStats', 160, { m_playerId: 1, m_stats: stats })]),
      [player(1, 'Player'), player(5, 'Not the user ID')],
    )
    expect(result).toMatchObject({
      version: REPLAY_INSIGHTS_VERSION,
      timeBasis: 'game-loops-16',
      players: [
        {
          playerId: 1,
          slot: 1,
          name: 'Player',
          production: [],
          economy: [
            {
              gameLoop: 160,
              minerals: 430,
              vespene: 72,
              mineralIncome: 875,
              vespeneIncome: 163,
              workers: 24,
              supplyUsed: 12,
              supplyCap: 14,
              armyMinerals: 850,
              armyVespene: 125,
            },
          ],
        },
      ],
    })
  })

  it('keeps fractional supply and does not fabricate missing, negative or nonnumeric scores', () => {
    const result = buildReplayInsights(
      tracker([
        event('PlayerStats', 0, {
          m_playerId: 3,
          m_stats: {
            m_scoreValueMineralsCurrent: 0,
            m_scoreValueFoodUsed: 4096 * 12.5,
            m_scoreValueWorkersActiveCount: -1,
            m_scoreValueFoodMade: -4096,
            m_scoreValueVespeneCurrent: '500',
            m_scoreValueMineralsUsedCurrentArmy: Infinity,
            m_scoreValueVespeneUsedCurrentArmy: NaN,
            m_mineralsCurrent: 999,
          },
        }),
      ]),
      [],
    )
    expect(result.players[0]!.economy[0]).toMatchObject({
      gameLoop: 0,
      minerals: 0,
      vespene: null,
      mineralIncome: null,
      vespeneIncome: null,
      workers: null,
      supplyUsed: 12.5,
      supplyCap: null,
      armyMinerals: null,
      armyVespene: null,
    })
  })

  it('never assigns identities by array order, tracker id, or user id without slot setup', () => {
    const result = buildReplayInsights(
      tracker([
        setup(4, null, 0),
        event('PlayerStats', 1, { m_playerId: 1, m_stats: {} }),
        event('PlayerStats', 1, { m_playerId: 4, m_stats: {} }),
      ]),
      [player(1, 'First'), player(4, 'Fourth')],
    )
    expect(result.players.map(({ playerId, slot, name }) => ({ playerId, slot, name }))).toEqual([
      { playerId: 1, slot: null, name: null },
      { playerId: 4, slot: null, name: null },
    ])
  })

  it('maps non-contiguous slots in multiteam games and does not add setup-only observers', () => {
    const result = buildReplayInsights(
      tracker([
        setup(1, 2, 7),
        setup(2, 0, 4),
        setup(8, 1, 0),
        setup(3, 4, null),
        unit('UnitBorn', 12, 1, 1, 1, 'Marine'),
        unit('UnitBorn', 13, 2, 1, 2, 'Zergling'),
        unit('UnitBorn', 14, 3, 1, 3, 'Zealot'),
      ]),
      [player(1, 'A', 3), player(3, 'B', 2), player(5, 'Computer', 1)],
    )
    expect(result.players.map(({ playerId, slot, name }) => ({ playerId, slot, name }))).toEqual([
      { playerId: 1, slot: 3, name: 'B' },
      { playerId: 2, slot: 1, name: 'A' },
      { playerId: 3, slot: 5, name: 'Computer' },
    ])
  })

  it('retains conflicting historical slot claims even after a player changes its claim', () => {
    const result = buildReplayInsights(
      tracker([
        setup(1, 0),
        setup(1, 1),
        setup(2, 0),
        event('PlayerStats', 160, { m_playerId: 2, m_stats: {} }),
      ]),
      [player(1, 'Ambiguous')],
    )
    expect(result.players[0]).toMatchObject({ playerId: 2, slot: null, name: null })
  })
  it('keeps two tracker identities claiming one lobby slot anonymous', () => {
    const result = buildReplayInsights(
      tracker([
        setup(1, 0),
        setup(2, 0),
        event('PlayerStats', 160, { m_playerId: 1, m_stats: { m_scoreValueMineralsCurrent: 10 } }),
        event('PlayerStats', 160, { m_playerId: 2, m_stats: { m_scoreValueMineralsCurrent: 20 } }),
      ]),
      [player(1, 'Must not be assigned twice')],
    )
    expect(result.players.map(({ playerId, slot, name }) => ({ playerId, slot, name }))).toEqual([
      { playerId: 1, slot: null, name: null },
      { playerId: 2, slot: null, name: null },
    ])
    expect(result.players.map((entry) => entry.economy[0]!.minerals)).toEqual([10, 20])
  })
  it('keeps unknown or conflicting metadata anonymous instead of guessing', () => {
    const result = buildReplayInsights(
      tracker([
        setup(1, 0),
        setup(1, 2),
        setup(2, 3),
        setup(3, 4),
        unit('UnitBorn', 1, 1, 1, 1),
        unit('UnitBorn', 2, 2, 1, 2),
        unit('UnitBorn', 3, 3, 1, 3),
      ]),
      [player(1, 'A'), player(3, 'B'), player(5, 'Duplicate'), player(5, 'Duplicate')],
    )
    expect(result.players.every((entry) => entry.slot === null && entry.name === null)).toBe(true)
  })

  it('emits observations only, excludes initial units and upgrades, preserves raw labels/counts', () => {
    const result = buildReplayInsights(
      tracker([
        unit('UnitBorn', 0),
        unit('UnitInit', 0, 6),
        unit('UnitDone', 5, 6),
        event('Upgrade', 0, { m_playerId: 1, m_upgradeTypeName: 'RewardFoo', m_count: 1 }),
        unit('UnitBorn', 20, 7, 1, 1, 'Broodling'),
        unit('UnitInit', 30, 8, 1, 1, 'Zealot'),
        unit('UnitDone', 40, 8),
        event('UnitTypeChange', 50, {
          m_unitTagIndex: 7,
          m_unitTagRecycle: 1,
          m_unitTypeName: 'Other',
        }),
        event('Upgrade', 60, {
          m_playerId: 1,
          m_upgradeTypeName: 'TerranInfantryWeaponsLevel2',
          m_count: 2,
        }),
        event('Upgrade', 61, { m_playerId: 1, m_upgradeTypeName: 'CustomUpgrade', m_count: -1 }),
      ]),
      [],
    )
    expect(result.players[0]!.production).toEqual([
      { gameLoop: 20, kind: 'unit-born', name: 'Broodling', count: 1 },
      { gameLoop: 30, kind: 'construction-started', name: 'Zealot', count: 1 },
      { gameLoop: 40, kind: 'construction-completed', name: 'Zealot', count: 1 },
      { gameLoop: 60, kind: 'upgrade-completed', name: 'TerranInfantryWeaponsLevel2', count: 2 },
      { gameLoop: 61, kind: 'upgrade-completed', name: 'CustomUpgrade', count: null },
    ])
  })

  it('matches both unit-tag parts, invalidates reused indices and completes once', () => {
    const result = buildReplayInsights(
      tracker([
        unit('UnitInit', 10),
        unit('UnitInit', 20, 5, 2, 1, 'Gateway'),
        unit('UnitDone', 30, 5, 1),
        unit('UnitDone', 40, 5, 2),
        unit('UnitDone', 50, 5, 2),
        unit('UnitInit', 60, 6),
        unit('UnitBorn', 70, 6, 2),
        unit('UnitDone', 80, 6, 1),
      ]),
      [],
    )
    expect(
      result.players[0]!.production.filter((entry) => entry.kind === 'construction-completed'),
    ).toEqual([{ gameLoop: 40, kind: 'construction-completed', name: 'Gateway', count: 1 }])
  })

  it('tracks upkeep ownership and type changes without inventing morph or capture production', () => {
    const result = buildReplayInsights(
      tracker([
        unit('UnitInit', 10),
        unit('UnitOwnerChange', 20, 5, 2, 3),
        unit('UnitOwnerChange', 30, 5, 1, 2),
        unit('UnitTypeChange', 40, 5, 1, 2, 'CustomWarpEntity'),
        unit('UnitDone', 50),
        unit('UnitDone', 60),
      ]),
      [],
    )
    expect(result.players.map((entry) => entry.playerId)).toEqual([1])
    expect(result.players[0]!.production).toEqual([
      { gameLoop: 10, kind: 'construction-started', name: 'Pylon', count: 1 },
    ])
  })

  it('never completes dead, unknown-tag, neutralized or malformed entities', () => {
    const result = buildReplayInsights(
      tracker([
        unit('UnitInit', 10),
        unit('UnitDied', 20),
        unit('UnitDone', 30),
        unit('UnitDone', 40, 999),
        unit('UnitInit', 50, 6),
        unit('UnitOwnerChange', 60, 6, 1, 0),
        unit('UnitDone', 70, 6),
        event('UnitInit', 80, { m_upkeepPlayerId: 1, m_unitTypeName: 'NoTag' }),
        event('UnitDone', 90, {}),
        unit('UnitBorn', 100, 7, 1, 0),
        unit('UnitBorn', 101, 8, 1, 256),
        unit('UnitBorn', 102, 9, 1, 1, ''),
      ]),
      [],
    )
    expect(result.players).toHaveLength(1)
    expect(
      result.players[0]!.production.every((entry) => entry.kind === 'construction-started'),
    ).toBe(true)
  })

  it('orders timestamps monotonically without mutating input and ignores invalid loops', () => {
    const input = tracker([
      unit('UnitDone', 80),
      event('PlayerStats', 100, { m_playerId: 1, m_stats: stats }),
      unit('UnitInit', 40),
      event('PlayerStats', 20, { m_playerId: 1, m_stats: stats }),
      unit('UnitBorn', -1),
      unit('UnitBorn', NaN),
      unit('UnitBorn', 1.5),
      event('PlayerStats', 30, { m_playerId: 1, m_stats: null }),
    ])
    const before = input.events.slice()
    const result = buildReplayInsights(input, [])
    expect(input.events).toEqual(before)
    expect(result.players[0]!.economy.map((entry) => entry.gameLoop)).toEqual([20, 100])
    expect(result.players[0]!.production.map((entry) => entry.gameLoop)).toEqual([40, 80])
  })

  it('returns a versioned empty projection and enforces the parser event ceiling', () => {
    expect(buildReplayInsights(tracker([]), [player(1, 'A')])).toEqual({
      version: REPLAY_INSIGHTS_VERSION,
      timeBasis: 'game-loops-16',
      players: [],
    })
    expect(() =>
      buildReplayInsights(tracker(Array.from({ length: 100_001 }, () => unit('UnitBorn', 1))), []),
    ).toThrow('event limit')
  })
})
