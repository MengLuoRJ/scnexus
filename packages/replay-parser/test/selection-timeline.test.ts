import { expect, test } from 'vitest'
import { buildReplaySelectionTimeline, parseReplayGameEvents } from '../src/index.js'
import { ProtocolDecoder, ReplayBitReader } from '../src/protocol-decoder.js'
import type { ReplayGameEvent, ReplayGameEvents } from '../src/game-events.js'
import type { ProtocolSchema } from '../src/protocol-schema.js'

function event(eventType: string, data: ReplayGameEvent['data'] = {}, userId = 0): ReplayGameEvent {
  return { eventId: 0, eventType: `NNet.Game.${eventType}`, data, gameLoop: 40, userId }
}
const command = (userId = 0) => event('SCmdEvent', {}, userId)
function selection(
  tags: number[],
  mask: ReplayGameEvent['data'][string] = { None: null },
  group = 10,
  userId = 0,
) {
  return event(
    'SSelectionDeltaEvent',
    { m_controlGroupId: group, m_delta: { m_removeMask: mask, m_addUnitTags: tags } },
    userId,
  )
}
function control(
  group: number,
  update: number,
  mask: ReplayGameEvent['data'][string] = { None: null },
  userId = 0,
) {
  return event(
    'SControlGroupUpdateEvent',
    { m_controlGroupIndex: group, m_controlGroupUpdate: update, m_mask: mask },
    userId,
  )
}
function game(events: ReplayGameEvent[]): ReplayGameEvents {
  return {
    baseBuild: 98310,
    protocolVersion: 's2protocol-98310',
    algorithmVersion: 'test',
    compatibility: { state: 'verified', protocolBuild: 98310, candidateBuilds: [98310] },
    processedEvents: events.length,
    skippedEvents: 0,
    events,
  }
}
function tags(...events: ReplayGameEvent[]) {
  return buildReplaySelectionTimeline(game(events)).map((item) => item.unitTags)
}

test('projects the empty initial selection of a complete decoded stream', () => {
  const decoded = parseReplayGameEvents(
    Uint8Array.from([0, 0x20, 0x0b, 0, 0, 0, 0, 0, 0, 0, 0]),
    98310,
  )
  expect(buildReplaySelectionTimeline(decoded)).toEqual([
    { eventIndex: 0, gameLoop: 0, userId: 0, unitTags: [], reason: null },
  ])
})

test('keeps encoded order within one loop and retains unsigned identities, not future selections', () => {
  const input = game([
    command(),
    selection([4294967295, 262146, 262146]),
    command(),
    selection([1]),
    command(),
  ])
  const before = structuredClone(input)
  const result = buildReplaySelectionTimeline(input)
  expect(result.map((item) => item.unitTags)).toEqual([
    [],
    [262146, 4294967295],
    [1, 262146, 4294967295],
  ])
  expect(result.map((item) => item.eventIndex)).toEqual([0, 2, 4])
  expect(input).toEqual(before)
  result[1]!.unitTags!.push(8)
  expect(result[2]!.unitTags).toEqual([1, 262146, 4294967295])
})

test('isolates raw users and stored groups and snapshots set, add and recall without aliasing', () => {
  expect(
    tags(
      selection([10]),
      control(1, 0),
      selection([20], { ZeroIndices: [] }),
      control(1, 1),
      selection([30], { ZeroIndices: [] }),
      control(1, 2),
      command(),
      selection([40], { None: null }, 10, 1),
      command(1),
      command(),
      selection([90], { None: null }, 2),
      command(),
      control(2, 2),
      command(),
    ),
  ).toEqual([[10, 20], [40], [10, 20], [10, 20], [90]])
})

test('removes or keeps indexed members and does not persist recall masks in the stored group', () => {
  expect(
    tags(
      selection([10, 20, 30]),
      selection([40], { OneIndices: [1] }),
      command(),
      control(0, 0),
      control(0, 2, { ZeroIndices: [2, 0] }),
      command(),
      control(0, 2),
      command(),
      selection([], { ZeroIndices: [] }),
      command(),
    ),
  ).toEqual([[10, 30, 40], [10, 40], [10, 30, 40], []])
})

test('applies an add-to-group mask before merging the active selection', () => {
  expect(
    tags(
      selection([10, 20]),
      control(1, 0),
      selection([30], { ZeroIndices: [] }),
      control(1, 1, { OneIndices: [0] }),
      control(1, 2),
      command(),
    ),
  ).toEqual([[20, 30]])
})

// Bit-packed integers join byte chunks most-significant first, while a selection mask
// addresses units in wire bit order. The original byte offset is therefore required.
test.each([0, 1, 2, 3, 4, 5, 6, 7])(
  'decodes mask membership across byte boundaries at offset %i',
  (offset) => {
    const length = 13
    const bytes = new Uint8Array(3)
    for (const index of [0, 8, 12])
      bytes[Math.floor((offset + index) / 8)]! |= 1 << ((offset + index) % 8)
    const reader = new ReplayBitReader(bytes)
    reader.position = offset
    const schema: ProtocolSchema = {
      initData: 0,
      delta: 0,
      eventId: 0,
      events: {},
      types: { 0: ['_bitarray', [[length, 0]]] },
    }
    const decoded = new ProtocolDecoder(schema, reader).decode(0)
    const units = Array.from({ length }, (_, index) => index + 1)
    const expected = units.filter((_, index) => ![0, 8, 12].includes(index))
    expect(tags(selection(units), selection([], { Mask: decoded }), command())).toEqual([expected])
    expect(tags(selection(units), selection([], decoded), command())).toEqual([expected])
  },
)

test.each([
  { OneIndices: [3] },
  { OneIndices: [0, 0] },
  { ZeroIndices: [-1] },
  { Mask: { bitLength: 4, bitOffset: 0, value: '0' } },
  { Mask: { bitLength: 2, bitOffset: 0, value: '4' } },
  { Mask: { bitLength: 2, value: '1' } },
  { Mask: { bitLength: 2, bitOffset: 8, value: '1' } },
  { Mask: { bitLength: 2, bitOffset: 0, value: '-1' } },
  { None: null, OneIndices: [] },
  { Unknown: null },
])(
  'marks malformed or ambiguous masks unknown and recovers only through a full replacement: %j',
  (mask) => {
    const output = buildReplaySelectionTimeline(
      game([
        selection([10, 20]),
        selection([], mask),
        command(),
        selection([30]),
        command(),
        selection([40], { ZeroIndices: [] }),
        command(),
      ]),
    )
    expect(output.map((item) => item.unitTags)).toEqual([null, null, [40]])
    expect(output[0]!.reason).toBe('invalid-selection')
    expect(output[2]!.reason).toBeNull()
  },
)

test('does not infer membership for unverified protocols or unsupported control-group operations', () => {
  const input = game([selection([10]), command()])
  input.compatibility.state = 'unverified'
  expect(buildReplaySelectionTimeline(input)[0]).toMatchObject({
    unitTags: null,
    reason: 'unverified-protocol',
  })
  for (const update of [3, 4, 5, 6]) {
    const output = buildReplaySelectionTimeline(
      game([
        selection([10]),
        control(0, 0),
        control(1, update),
        control(0, 2),
        command(),
        selection([20], { ZeroIndices: [] }),
        command(),
      ]),
    )
    expect(output[0]).toMatchObject({ unitTags: null, reason: 'unsupported-update' })
    expect(output[1]).toMatchObject({ unitTags: [20], reason: null })
  }
})

test('invalid deltas invalidate only their own user and do not borrow another group', () => {
  const broken = selection([1])
  broken.data.m_delta = null
  expect(tags(selection([7], { None: null }, 10, 1), broken, command(), command(1))).toEqual([
    null,
    [7],
  ])
  expect(
    tags(selection([-1]), command(), selection([4294967296], { ZeroIndices: [] }), command()),
  ).toEqual([null, null])
})

test('enforces selection, event, output and chronology limits', () => {
  expect(tags(selection(Array.from({ length: 513 }, (_, index) => index)), command())).toEqual([
    null,
  ])
  expect(() => buildReplaySelectionTimeline(game(Array.from({ length: 100001 }, command)))).toThrow(
    'event limit',
  )
  const bounded = buildReplaySelectionTimeline(
    game([
      selection(Array.from({ length: 512 }, (_, index) => index)),
      ...Array.from({ length: 490 }, () => command()),
    ]),
  )
  expect(bounded).toHaveLength(490)
  expect(
    bounded.reduce((count, item) => count + (item.unitTags?.length ?? 0), 0),
  ).toBeLessThanOrEqual(250000)
  expect(bounded.slice(-2)).toEqual([
    expect.objectContaining({ unitTags: null, reason: 'budget-exceeded' }),
    expect.objectContaining({ unitTags: null, reason: 'budget-exceeded' }),
  ])
  const backwards = command()
  backwards.gameLoop = 39
  expect(() => buildReplaySelectionTimeline(game([command(), backwards]))).toThrow(
    'must be ordered',
  )
  for (const gameLoop of [-1, NaN, Infinity]) {
    expect(() => buildReplaySelectionTimeline(game([{ ...command(), gameLoop }]))).toThrow(
      'must be ordered',
    )
  }
})
