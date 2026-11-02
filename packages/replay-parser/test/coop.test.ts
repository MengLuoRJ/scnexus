import { describe, expect, it } from 'vitest'
import { identifyReplayCoop, parseReplayCoop } from '../src/coop.js'
import { parseReplayTrackerEvents } from '../src/components.js'
import { replayProtocol } from '../src/protocol-schema.js'
import type { ReplayInitData, ReplayTrackerEvent, ReplayTrackerEvents } from '../src/components.js'
import type { ReplayProtocolValue } from '../src/protocol-decoder.js'

const blob = (text: string) => ({ text, hex: Buffer.from(text).toString('hex') })
const init = (
  flag: ReplayProtocolValue = true,
  overrides: Record<string, ReplayProtocolValue> = {},
): ReplayInitData => ({
  baseBuild: 98310,
  protocolVersion: 's2protocol-98310',
  algorithmVersion: 'test',
  data: {
    m_syncLobbyState: {
      m_gameDescription: { m_isCoopMode: flag },
      m_lobbyState: {
        m_slots: [
          {
            m_userId: 4,
            m_observe: 0,
            m_toonHandle: blob('1-S2-1-123'),
            m_commander: blob('Raynor'),
            m_commanderLevel: 15,
            m_commanderMasteryLevel: 90,
            m_commanderMasteryTalents: [30, 0, 30, 0, 0, 30],
            m_difficulty: 4,
            ...overrides,
          },
          { m_userId: 5, m_observe: 1, m_commander: blob('Observer') },
        ],
      },
    },
  },
})
const event = (
  kind: string,
  data: Record<string, ReplayProtocolValue>,
  gameLoop = 16,
): ReplayTrackerEvent => ({
  eventId: 0,
  eventType: `NNet.Replay.Tracker.${kind}`,
  data,
  gameLoop,
})
const tracker = (events: ReplayTrackerEvent[], skippedEvents = 0): ReplayTrackerEvents =>
  ({
    baseBuild: 98310,
    protocolVersion: 'tracker-versioned-v1',
    algorithmVersion: 'test',
    decoderStrategy: 'self-describing-versioned',
    unknownEventIds: [],
    skippedEvents,
    warnings: [],
    events,
  }) as ReplayTrackerEvents
const tag = (index: number, recycle = 1) => ({ m_unitTagIndex: index, m_unitTagRecycle: recycle })
const born = (index: number, owner: number, type: string, recycle = 1) =>
  event('SUnitBornEvent', {
    ...tag(index, recycle),
    m_controlPlayerId: owner,
    m_unitTypeName: blob(type),
  })
const died = (index: number, recycle = 1, killer = 2) =>
  event(
    'SUnitDiedEvent',
    {
      ...tag(index, recycle),
      m_killerPlayerId: killer,
    },
    160,
  )

describe('co-op identification and raw metadata', () => {
  it('requires explicit flag; never guesses from commander or cooperative teams', () => {
    expect(identifyReplayCoop(null).identification).toBe('unknown')
    expect(identifyReplayCoop(init(false)).identification).toBe('not-coop')
    const missing = init()
    delete (missing.data.m_syncLobbyState as Record<string, ReplayProtocolValue>).m_gameDescription
    expect(identifyReplayCoop(missing).identification).toBe('unknown')
    expect(identifyReplayCoop(init(1)).identification).toBe('unknown')
  })
  it('uses blob.text and explicit active human slots, preserving unknown legacy prestige', () => {
    const summary = identifyReplayCoop(init())
    expect(summary.players).toHaveLength(1)
    expect(summary.players[0]).toMatchObject({
      slotId: 0,
      userId: 4,
      playerId: null,
      profileHandle: '1-S2-1-123',
      commander: 'Raynor',
      level: 15,
      prestige: null,
      masteryLevel: 90,
      masteryTalents: [30, 0, 30, 0, 0, 30],
      difficulty: 4,
    })
    expect(summary.mutators.state).toBe('unknown')
    expect(
      identifyReplayCoop(init(true, { m_selectedCommanderPrestige: 0 })).players[0]?.prestige,
    ).toBe(0)
  })
  it('keeps raw retry indexes and enemy composition separate from verified mutator names', () => {
    const result = parseReplayCoop(
      init(true, { m_retryMutationIndexes: [3, 7], m_aCEnemyRace: 2, m_aCEnemyWaveType: 15 }),
      null,
    )
    expect(result.enemyComposition).toEqual({ state: 'raw', raceIds: [2], waveTypeIds: [15] })
    expect(result.players[0]?.retryMutationIndexes).toEqual([3, 7])
    expect(result.rewards.state).toBe('unknown')
    expect(result.units.state).toBe('unknown')
    expect(result.timing.state).toBe('unknown')
    expect(result.damage.state).toBe('unknown')
  })
})

describe('co-op tracker lifecycles', () => {
  it('counts init/done once, does not treat morphs and transfers as production, attributes death to current owner/type', () => {
    const result = parseReplayCoop(
      init(),
      tracker([
        event('SPlayerSetupEvent', { m_playerId: 2, m_userId: 4, m_slotId: 0 }),
        event('SUnitInitEvent', { ...tag(1), m_controlPlayerId: 1, m_unitTypeName: blob('Egg') }),
        event('SUnitDoneEvent', tag(1)),
        event('SUnitDoneEvent', tag(1)),
        event('SUnitTypeChangeEvent', { ...tag(1), m_unitTypeName: blob('Zergling') }),
        event('SUnitOwnerChangeEvent', { ...tag(1), m_controlPlayerId: 2 }),
        born(2, 3, 'Target'),
        event('SUnitDiedEvent', {
          ...tag(2),
          m_killerPlayerId: 2,
          m_killerUnitTagIndex: 1,
          m_killerUnitTagRecycle: 1,
        }),
        died(1),
      ]),
    )
    expect(result.players[0]?.playerId).toBe(2)
    expect(result.units.counts).toContainEqual({
      playerId: 1,
      unitType: 'Egg',
      started: 1,
      completed: 1,
      born: 0,
      died: 0,
      kills: 0,
    })
    expect(result.units.counts).toContainEqual({
      playerId: 2,
      unitType: 'Zergling',
      started: 0,
      completed: 0,
      born: 0,
      died: 1,
      kills: 1,
    })
    expect(result.timing.observedSeconds).toBe(10)
  })
  it('isolates recycle generations and never resurrects a stale duplicate death', () => {
    const result = parseReplayCoop(
      init(),
      tracker([born(7, 1, 'Marine'), died(7), born(7, 2, 'Roach', 2), died(7), died(7, 2)]),
    )
    expect(result.units.state).toBe('partial')
    expect(result.units.unresolvedEvents).toBe(1)
    expect(
      result.units.counts.filter((row) => row.died).map((row) => [row.unitType, row.died]),
    ).toEqual([
      ['Marine', 1],
      ['Roach', 1],
    ])
  })
  it('flags missing births, unknown killers, malformed ownership and skipped events without fake attribution', () => {
    const result = parseReplayCoop(
      init(),
      tracker(
        [
          died(99),
          born(1, 1, 'Marine'),
          event('SUnitOwnerChangeEvent', { ...tag(1), m_controlPlayerId: null }),
          event('SUnitDiedEvent', { ...tag(1), m_killerPlayerId: null }),
        ],
        1,
      ),
    )
    expect(result.units.unresolvedEvents).toBe(3)
    expect(result.units.state).toBe('partial')
    expect(result.units.counts.reduce((sum, row) => sum + row.kills, 0)).toBe(0)
  })
  it('does not count a cancelled init as completed; repeated birth does not inflate production', () => {
    const result = parseReplayCoop(
      init(),
      tracker([
        event('SUnitInitEvent', {
          ...tag(1),
          m_controlPlayerId: 1,
          m_unitTypeName: blob('Barracks'),
        }),
        died(1),
        born(1, 1, 'Barracks'),
        event('SUnitDoneEvent', tag(1)),
      ]),
    )
    expect(result.units.counts[0]).toMatchObject({ started: 1, completed: 0, died: 1, born: 0 })
    expect(result.units.unresolvedEvents).toBe(2)
  })
  it('returns unknown for empty tracker duration and absent co-op evidence', () => {
    expect(parseReplayCoop(init(), tracker([])).timing.state).toBe('unknown')
    expect(parseReplayCoop(null, tracker([born(1, 1, 'Marine')])).units.state).toBe('unknown')
  })
})

describe('special upgrade observations without GPL mappings', () => {
  it('retains player-zero mutatorinfo IDs with source and time without claiming active-set completeness', () => {
    const result = parseReplayCoop(
      init(),
      tracker([
        event(
          'SUpgradeEvent',
          { m_playerId: 0, m_upgradeTypeName: blob('mutatorinfo_test42'), m_count: 1 },
          48,
        ),
        event(
          'SUpgradeEvent',
          { m_playerId: 0, m_upgradeTypeName: blob('mutatorinfo_test42'), m_count: 2 },
          64,
        ),
        event('SUpgradeEvent', {
          m_playerId: 1,
          m_upgradeTypeName: blob('mutatorinfo_not_global'),
          m_count: 1,
        }),
        event('SUpgradeEvent', {
          m_playerId: 1,
          m_upgradeTypeName: blob('CommanderTalentUnverified'),
          m_count: 3,
        }),
      ]),
    )
    expect(result.mutators).toMatchObject({
      state: 'raw',
      ids: ['mutatorinfo_test42'],
      source: 'tracker-upgrade',
      completeness: 'unknown',
    })
    expect(result.upgrades.events).toHaveLength(4)
    expect(result.upgrades.events[0]).toMatchObject({
      playerId: 0,
      count: 1,
      gameLoop: 48,
      seconds: 3,
      source: 'tracker-upgrade',
    })
    expect(result.players[0]?.commander).toBe('Raynor')
    expect(result.bonusObjectives).toMatchObject({ state: 'unknown', completionTimesSeconds: null })
  })
  it('preserves arcade upgrade evidence with unknown co-op identity, but does not classify by it', () => {
    const result = parseReplayCoop(
      null,
      tracker([
        event('SUpgradeEvent', {
          m_playerId: 0,
          m_upgradeTypeName: blob('mutatorinfo_1'),
          m_count: 1,
        }),
        event('SUpgradeEvent', {
          m_playerId: 1,
          m_upgradeTypeName: blob('SomeCommanderUpgrade'),
          m_count: 1,
        }),
      ]),
    )
    expect(result.identification).toBe('unknown')
    expect(result.upgrades.state).toBe('available')
    expect(result.mutators.state).toBe('raw')
    expect(result.players).toEqual([])
    expect(result.units.state).toBe('unknown')
  })
  it('flags malformed observations, preserves zero counts and excludes unrelated upgrades from mutator evidence', () => {
    const result = parseReplayCoop(
      init(),
      tracker([
        event('SUpgradeEvent', {
          m_playerId: 0,
          m_upgradeTypeName: blob('Notmutatorinfo'),
          m_count: 0,
        }),
        event('SUpgradeEvent', {
          m_playerId: 0,
          m_upgradeTypeName: blob('mutatorinfo_bad'),
          m_count: null,
        }),
      ]),
    )
    expect(result.upgrades.state).toBe('partial')
    expect(result.upgrades.events).toHaveLength(1)
    expect(result.upgrades.events[0]?.count).toBe(0)
    expect(result.mutators.state).toBe('unknown')
  })
})

it.each([70154, 98310])(
  'proves explicit co-op flag and commander fields exist in exact initData schema %i',
  (build) => {
    const schema = replayProtocol(build)
    const description = schema.types[59]!
    expect(description[0]).toBe('_struct')
    if (description[0] !== '_struct') throw new Error('Expected description struct')
    expect(description[1][0]).toContainEqual(['m_isCoopMode', 13, -2])
    expect(schema.types[13]).toEqual(['_bool', []])
    const slot = schema.types[69]!
    if (slot[0] !== '_struct') throw new Error('Expected slot struct')
    expect(slot[1][0].some(([name, type]) => name === 'm_commander' && type === 46)).toBe(true)
    expect(slot[1][0].some(([name]) => name === 'm_selectedCommanderPrestige')).toBe(
      build === 98310,
    )
  },
)

it('decodes a self-describing wire upgrade before extracting the raw marker, without an ID table', () => {
  // Versioned delta choice(0), event id(5), struct fields: player(0), blob, count(1).
  const marker = 'mutatorinfo_wire'
  const bytes = Uint8Array.from([
    3,
    0,
    9,
    0,
    9,
    10,
    5,
    6,
    0,
    9,
    0,
    2,
    2,
    marker.length * 2,
    ...Buffer.from(marker),
    4,
    9,
    2,
  ])
  const decoded = parseReplayTrackerEvents(bytes, 98310)
  expect(decoded.events[0]).toMatchObject({
    eventId: 5,
    eventType: 'NNet.Replay.Tracker.SUpgradeEvent',
    data: { m_playerId: 0, m_upgradeTypeName: { text: marker }, m_count: 1 },
  })
  const result = parseReplayCoop(init(), decoded)
  expect(result.mutators).toMatchObject({
    state: 'raw',
    ids: [marker],
    source: 'tracker-upgrade',
    evidence: {
      eventType: 'NNet.Replay.Tracker.SUpgradeEvent',
      playerId: 0,
      match: 'mutatorinfo-prefix',
    },
  })
})
