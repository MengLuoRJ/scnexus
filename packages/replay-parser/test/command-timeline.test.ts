import { expect, test } from 'vitest'
import { buildReplayCommandTimeline } from '../src/command-timeline.js'
import { parseReplayGameEvents } from '../src/game-events.js'
import type { ReplayGameEvents } from '../src/game-events.js'
import type { ReplaySpatialTimeline } from '../src/spatial-timeline.js'

function spatial(): ReplaySpatialTimeline {
  const observation = {
    gameLoop: 10,
    kind: 'born' as const,
    unitType: 'Marine',
    controlPlayerId: 1,
    upkeepPlayerId: 1,
    x: 10,
    y: 20,
    positionGameLoop: 10,
    completed: true,
  }
  return {
    version: 1,
    baseBuild: 98310,
    durationGameLoops: 100,
    partial: false,
    diagnostics: [],
    units: [
      {
        unitTag: '1:2',
        unitTagIndex: 1,
        unitTagRecycle: 2,
        startedGameLoop: 10,
        diedGameLoop: 90,
        observations: [
          observation,
          { ...observation, gameLoop: 50, kind: 'type-change', unitType: 'Marauder' },
        ],
      },
    ],
  }
}
function game(data: ReplayGameEvents['events'][number]['data'], loop = 40): ReplayGameEvents {
  return {
    baseBuild: 98310,
    protocolVersion: 's2protocol-98310',
    algorithmVersion: 'test',
    compatibility: { state: 'verified', protocolBuild: 98310, candidateBuilds: [98310] },
    processedEvents: 1,
    skippedEvents: 0,
    events: [{ eventId: 27, eventType: 'NNet.Game.SCmdEvent', gameLoop: loop, userId: 0, data }],
  }
}
const unitData = { m_data: { TargetUnit: { m_tag: 262146 } } }
function target(data = unitData, loop = 40, timeline = spatial()) {
  return buildReplayCommandTimeline(game(data, loop), timeline)[0]!.target
}

test('normalizes an actual decoded bit-packed command without introducing an executing unit', () => {
  const decoded = parseReplayGameEvents(
    Uint8Array.from([0, 0x20, 0x0b, 0, 0, 0, 0, 0, 0, 0, 0]),
    98310,
  )
  expect(buildReplayCommandTimeline(decoded)).toEqual([
    {
      gameLoop: 0,
      userId: 0,
      abilityLink: null,
      abilityIndex: null,
      flags: 0,
      target: { kind: 'none' },
      selection: { unitTags: [], reason: null },
    },
  ])
})

test('associates the exact target identity with an earlier lifecycle record without mutating inputs', () => {
  const input = game(unitData)
  const timeline = spatial()
  const before = structuredClone({ input, timeline })
  expect(buildReplayCommandTimeline(input, timeline)).toEqual([
    {
      gameLoop: 40,
      userId: 0,
      abilityLink: null,
      abilityIndex: null,
      flags: 0,
      selection: { unitTags: [], reason: null },
      target: {
        kind: 'unit',
        rawTag: 262146,
        unitTag: '1:2',
        unitType: 'Marine',
        observedGameLoop: 10,
      },
    },
  ])
  expect({ input, timeline }).toEqual(before)
})

test.each([0, 9, 10, 90, 91])(
  'does not associate before birth, after death or at uncertain boundaries: %s',
  (loop) => {
    expect(target(unitData, loop)).toEqual({
      kind: 'unit',
      rawTag: 262146,
      unitTag: null,
      unitType: null,
      observedGameLoop: null,
    })
  },
)

test('does not use a same-loop or future type change as an earlier target record', () => {
  expect(target(unitData, 50)).toMatchObject({ unitType: 'Marine', observedGameLoop: 10 })
  expect(target(unitData, 51)).toMatchObject({ unitType: 'Marauder', observedGameLoop: 50 })
  expect(target(unitData, 40)).toMatchObject({ unitType: 'Marine', observedGameLoop: 10 })
})

test('keeps raw targets but does not associate unverified protocols or different builds', () => {
  const unverified = game(unitData)
  unverified.compatibility.state = 'unverified'
  expect(buildReplayCommandTimeline(unverified, spatial())[0]!.target).toMatchObject({
    rawTag: 262146,
    unitTag: null,
  })
  const other = spatial()
  other.baseBuild++
  expect(target(unitData, 40, other)).toMatchObject({ rawTag: 262146, unitTag: null })
})

test('rejects duplicate identities and unreliable lifecycle evidence', () => {
  const duplicate = spatial()
  duplicate.units.push(structuredClone(duplicate.units[0]!))
  expect(target(unitData, 40, duplicate)).toMatchObject({ unitTag: null })
  for (const code of ['duplicate-unit', 'malformed-event', 'budget-exceeded'] as const) {
    const timeline = spatial()
    timeline.diagnostics.push({ code, gameLoop: 0 })
    expect(target(unitData, 40, timeline)).toMatchObject({ unitTag: null })
  }
  const partial = spatial()
  partial.partial = true
  partial.diagnostics.push({ code: 'incomplete-tracker', gameLoop: null })
  expect(target(unitData, 40, partial)).toMatchObject({ unitTag: '1:2' })
})

test('does not conflate recycled indices and preserves unsigned 32-bit tags', () => {
  const timeline = spatial()
  const unit = timeline.units[0]!
  timeline.units.push({
    ...unit,
    unitTag: '1:3',
    unitTagRecycle: 3,
    startedGameLoop: 95,
    diedGameLoop: null,
  })
  expect(target({ m_data: { TargetUnit: { m_tag: 262147 } } }, 80, timeline)).toMatchObject({
    unitTag: null,
  })
  const highest = spatial()
  Object.assign(highest.units[0]!, {
    unitTag: '16383:262143',
    unitTagIndex: 16383,
    unitTagRecycle: 262143,
  })
  expect(target({ m_data: { TargetUnit: { m_tag: 0xffffffff } } }, 40, highest)).toMatchObject({
    rawTag: 0xffffffff,
    unitTag: '16383:262143',
  })
})

test('distinguishes explicit no target, points, other data and unknown legacy targets', () => {
  for (const [m_data, expected] of [
    [{ None: null }, { kind: 'none' }],
    [
      { TargetPoint: { x: 4096, y: -8192, z: 123 } },
      { kind: 'point', rawPoint: { x: 4096, y: -8192, z: 123 } },
    ],
    [{ TargetPoint: { x: 0, y: 0 } }, { kind: 'point', rawPoint: { x: 0, y: 0, z: null } }],
    [{ Data: 0 }, { kind: 'data', value: 0 }],
    [{ None: null, TargetUnit: { m_tag: 262146 } }, { kind: 'unknown' }],
    [{ None: 1 }, { kind: 'unknown' }],
    [{ TargetPoint: { x: 1.5, y: 0 } }, { kind: 'unknown' }],
  ] as const) {
    expect(buildReplayCommandTimeline(game({ m_data }))[0]!.target).toEqual(expected)
  }
  const legacy = game({ m_abilLink: 5, m_abilCmdIndex: 0, m_targetUnitTag: 262146 })
  expect(buildReplayCommandTimeline(legacy)[0]).toMatchObject({
    abilityLink: 5,
    abilityIndex: 0,
    target: { kind: 'unknown' },
  })
})

test.each([-1, 0x100000000, NaN, Infinity, '262146', null])(
  'does not coerce invalid tags: %j',
  (value) => {
    expect(
      buildReplayCommandTimeline(game({ m_data: { TargetUnit: { m_tag: value } } }))[0]!.target,
    ).toEqual({ kind: 'unknown' })
  },
)

test('respects modern explicit missing ability and excludes non-command events', () => {
  const input = game({ m_abil: null, m_abilLink: 12, m_data: { None: null } })
  input.events.push({ ...input.events[0]!, eventType: 'NNet.Game.SSelectionDeltaEvent' })
  expect(buildReplayCommandTimeline(input)).toHaveLength(1)
  expect(buildReplayCommandTimeline(input)[0]!.abilityLink).toBeNull()
})

test('enforces existing event and unit ceilings before indexing', () => {
  const input = game(unitData)
  input.events = Array.from({ length: 100001 }, () => input.events[0]!)
  expect(() => buildReplayCommandTimeline(input)).toThrow('limit exceeded')
  const timeline = spatial()
  timeline.units = Array.from({ length: 50001 }, () => timeline.units[0]!)
  expect(() => buildReplayCommandTimeline(game(unitData), timeline)).toThrow('limit exceeded')
})
