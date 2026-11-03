import { describe, expect, it } from 'vitest'
import {
  parseReplayAttributes,
  parseReplayInitData,
  parseReplayTrackerEvents,
  UnsupportedReplayBuildError,
  SUPPORTED_REPLAY_BASE_BUILDS,
} from '../src/index.js'
import { ProtocolDecoder, ReplayBitReader } from '../src/protocol-decoder.js'
import { replayProtocol, replayInitDataProtocolBuild } from '../src/protocol-schema.js'
import type { ProtocolSchema } from '../src/protocol-schema.js'

function vint(n: number): number[] {
  const negative = n < 0
  n = Math.abs(n)
  const result = [(n % 64) * 2 + Number(negative)]
  n = Math.floor(n / 64)
  while (n) {
    result[result.length - 1]! |= 128
    result.push(n % 128)
    n = Math.floor(n / 128)
  }
  return result
}
const integer = (n: number) => [9, ...vint(n)]
const struct = (fields: number[][]) => [
  5,
  ...vint(fields.length),
  ...fields.flatMap((v, i) => [...vint(i), ...v]),
]
const delta = (n: number) => [3, n >= 64 ? 2 : 0, ...integer(n)]

// Independently write low-bit-first byte chunks, including unaligned multi-byte integers.
class Writer {
  bytes: number[] = []
  position = 0
  bits(value: bigint, width: number): void {
    let remaining = width
    while (remaining) {
      const shift = this.position % 8
      const take = Math.min(8 - shift, remaining)
      const index = Math.floor(this.position / 8)
      remaining -= take
      this.bytes[index] =
        (this.bytes[index] ?? 0) |
        (Number((value >> BigInt(remaining)) & ((1n << BigInt(take)) - 1n)) << shift)
      this.position += take
    }
  }
  minimal(schema: ProtocolSchema, id: number): void {
    const type = schema.types[id]!
    switch (type[0]) {
      case '_int':
        this.bits(0n, type[1][0][1])
        break
      case '_bool':
      case '_optional':
        this.bits(0n, 1)
        break
      case '_array':
      case '_blob':
      case '_bitarray':
        this.bits(0n, type[1][0][1])
        if (type[0] === '_blob') this.position = Math.ceil(this.position / 8) * 8
        break
      case '_struct':
        for (const field of type[1][0]) this.minimal(schema, field[1])
        break
      case '_choice': {
        const [tag, field] = Object.entries(type[1][1])[0]!
        this.bits(BigInt(Number(tag) - type[1][0][0]), type[1][0][1])
        this.minimal(schema, field[1])
        break
      }
    }
  }
  data(): Uint8Array {
    return Uint8Array.from(
      Array.from({ length: Math.ceil(this.position / 8) }, (_, i) => this.bytes[i] ?? 0),
    )
  }
}

describe('component protocol foundation', () => {
  it('has exact build dispatch, never latest/nearest fallback', () => {
    expect(SUPPORTED_REPLAY_BASE_BUILDS).toHaveLength(93)
    expect(SUPPORTED_REPLAY_BASE_BUILDS).toContain(62848)
    for (const build of [0, 70153, 70326, 98311, NaN]) {
      expect(() =>
        parseReplayInitData(new Uint8Array(), build, { allowUnverified: false }),
      ).toThrow(UnsupportedReplayBuildError)
    }
  })
  it.each([...SUPPORTED_REPLAY_BASE_BUILDS])(
    'decodes complete synthetic initData for %i',
    (build) => {
      const schema = replayProtocol(build)
      const writer = new Writer()
      writer.minimal(schema, schema.initData)
      const bytes = writer.data()
      const result = parseReplayInitData(bytes, build)
      expect(result.protocolVersion).toBe(`s2protocol-${replayInitDataProtocolBuild(build)}`)
      expect(result.data).toHaveProperty('m_syncLobbyState.m_gameDescription.m_gameSpeed', 0)
      expect(() => JSON.stringify(result)).not.toThrow(/Truncated|Invalid/)
      expect(() => parseReplayInitData(bytes.subarray(0, -1), build)).toThrow(/Truncated|Invalid/)
      expect(() => parseReplayInitData(Uint8Array.from([...bytes, 0]), build)).toThrow('Trailing')
    },
  )
  it('preserves unaligned integers and bitarrays without numeric precision loss', () => {
    const schema: ProtocolSchema = {
      initData: 0,
      delta: 0,
      eventId: 0,
      events: {},
      types: { 0: ['_int', [[0, 64]]], 1: ['_bitarray', [[0, 6]]] },
    }
    const writer = new Writer()
    writer.bits(3n, 2)
    writer.bits(0xffffffffffffffffn, 64)
    writer.bits(9n, 6)
    writer.bits(341n, 9)
    const reader = new ReplayBitReader(writer.data())
    expect(reader.bits(2)).toBe(3n)
    const decoder = new ProtocolDecoder(schema, reader)
    expect(decoder.decode(0)).toBe('18446744073709551615')
    expect(decoder.decode(1)).toEqual({ bitLength: 9, value: '341' })
  })
  it.each([70154, 98310])(
    'decodes tracker deltas, signed stats and optional values for %i',
    (build) => {
      const bytes = Uint8Array.from([
        ...delta(15),
        ...integer(9),
        ...struct([integer(1), integer(2), [4, 1, ...integer(0)], [4, 0]]),
        ...delta(200),
        ...integer(0),
        ...struct([integer(1), struct([integer(-12)])]),
      ])
      const result = parseReplayTrackerEvents(bytes, build)
      expect(result.events.map((e) => e.gameLoop)).toEqual([15, 215])
      expect(result.events[0]!.data).toEqual({
        m_playerId: 1,
        m_type: 2,
        m_userId: 0,
        m_slotId: null,
      })
      expect(result.events[1]!.data).toHaveProperty('m_stats.m_scoreValueMineralsCurrent', -12)
      expect(() => JSON.stringify(result)).not.toThrow(/Truncated|Invalid/)
      expect(() => parseReplayTrackerEvents(bytes.subarray(0, -1), build)).toThrow(
        /Truncated|Invalid/,
      )
      expect(
        parseReplayTrackerEvents(
          Uint8Array.from([...delta(0), ...integer(15), ...struct([])]),
          build,
        ),
      ).toMatchObject({ unknownEventIds: [15], skippedEvents: 1, events: [] })
      expect(() =>
        parseReplayTrackerEvents(
          Uint8Array.from([...delta(-1), ...integer(9), ...struct([])]),
          build,
        ),
      ).toThrow('bounds')
    },
  )
  it.each([1, 98369, 98370, 98371, 1000000])(
    'keeps initData unsupported for unregistered build %i',
    (build) => {
      expect(() =>
        parseReplayInitData(new Uint8Array(), build, { allowUnverified: false }),
      ).toThrow(UnsupportedReplayBuildError)
    },
  )
  it.each([1, 70154, 98310, 98369, 98370, 98371, 1000000])(
    'uses the explicitly versioned tracker capability for source build %i',
    (build) => {
      const setup = struct([integer(1), integer(2), [4, 1, ...integer(0)], [4, 0]])
      const data = Uint8Array.from([...delta(15), ...integer(9), ...setup])
      const result = parseReplayTrackerEvents(data, build)
      expect(result).toMatchObject({
        baseBuild: build,
        protocolVersion: 'tracker-versioned-v1',
        decoderStrategy: 'self-describing-versioned',
        unknownEventIds: [],
        skippedEvents: 0,
        warnings: [],
      })
      expect(result.events).toEqual(parseReplayTrackerEvents(data, 98310).events)
    },
  )
  it('projects available fields without defaults and ignores unknown field tags', () => {
    const extra = struct([integer(1), integer(2), [4, 0], [4, 0], integer(99)])
    const result = parseReplayTrackerEvents(
      Uint8Array.from([
        ...delta(0),
        ...integer(9),
        ...extra,
        ...delta(1),
        ...integer(9),
        ...struct([integer(1)]),
      ]),
      98370,
    )
    expect(result.skippedEvents).toBe(0)
    expect(result.events[0]!.data).toEqual({
      m_playerId: 1,
      m_type: 2,
      m_userId: null,
      m_slotId: null,
    })
    expect(result.events[1]!.data).toEqual({ m_playerId: 1 })
  })
  it('counts unknown and mismatched events against the budget and retains safe cumulative loops', () => {
    const data = Uint8Array.from([
      ...delta(2),
      ...integer(77),
      ...struct([integer(4)]),
      ...delta(3),
      ...integer(9),
      ...struct([integer(16)]),
      ...delta(4),
      ...integer(0),
      ...struct([integer(1), struct([integer(42)])]),
    ])
    const result = parseReplayTrackerEvents(data, 99999)
    expect(result).toMatchObject({ unknownEventIds: [77], skippedEvents: 2 })
    expect(result.warnings).toHaveLength(2)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      gameLoop: 9,
      data: { m_playerId: 1, m_stats: { m_scoreValueMineralsCurrent: 42 } },
    })
    expect(() => parseReplayTrackerEvents(data, 99999, { maxEvents: 2 })).toThrow('event limit')
  })
  it.each(
    [
      struct([integer(-1)]),
      struct([integer(16)]),
      struct([[6, 1]]),
      struct([[3, 0, ...integer(1)]]),
      struct([[4, 1, ...integer(1)]]),
      struct([integer(1), integer(2), integer(0)]),
      struct([integer(1), integer(2), [4, 1, ...integer(4294967296)]]),
      struct([integer(1), integer(2), [4, 0], [4, 1, ...integer(-1)]]),
    ].map((body) => [body]),
  )('skips structurally complete schema-incompatible known events', (body) => {
    const result = parseReplayTrackerEvents(
      Uint8Array.from([
        ...delta(1),
        ...integer(9),
        ...body,
        ...delta(2),
        ...integer(9),
        ...struct([integer(2)]),
      ]),
      98370,
    )
    expect(result.skippedEvents).toBe(1)
    expect(result.warnings[0]).toContain('schema mismatch')
    expect(result.events).toHaveLength(1)
    expect(result.events[0]!.gameLoop).toBe(3)
  })
  it('deduplicates unknown ids but counts every skipped payload including non-struct values', () => {
    const result = parseReplayTrackerEvents(
      Uint8Array.from([
        ...delta(0),
        ...integer(1000),
        ...integer(3),
        ...delta(1),
        ...integer(1000),
        0,
        ...vint(1),
        ...struct([]),
      ]),
      98370,
    )
    expect(result).toMatchObject({ unknownEventIds: [1000], skippedEvents: 2, events: [] })
    expect(result.warnings).toHaveLength(1)
  })
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid source build %s',
    (build) => {
      expect(() => parseReplayTrackerEvents(new Uint8Array(), build)).toThrow(
        UnsupportedReplayBuildError,
      )
    },
  )
  it.each([0, -1, 1.5, NaN, 100001])('rejects invalid event budget %s', (maxEvents) => {
    expect(() => parseReplayTrackerEvents(new Uint8Array(), 98370, { maxEvents })).toThrow(
      RangeError,
    )
  })
  it.each(
    [[5], [255], [5, 2, 0], [4, 2], [9, 128], [5, 4, 0, ...integer(1), 0, ...integer(2)]].map(
      (body) => [body],
    ),
  )('halts on corrupt or truncated known and unknown payloads', (body) => {
    for (const eventId of [9, 999]) {
      expect(() =>
        parseReplayTrackerEvents(
          Uint8Array.from([...delta(0), ...integer(eventId), ...body]),
          98370,
        ),
      ).toThrow(/Truncated|Invalid|Duplicate|Unknown/)
    }
  })
  it('halts on truncated or invalid envelope without trying later event boundaries', () => {
    const data = [...delta(1), ...integer(9), ...struct([integer(1)])]
    for (let length = 1; length < data.length; length++)
      expect(() => parseReplayTrackerEvents(Uint8Array.from(data.slice(0, length)), 98370)).toThrow(
        /Truncated|Invalid|Duplicate|Unknown/,
      )
    for (const id of [-1, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        parseReplayTrackerEvents(
          Uint8Array.from([...delta(1), ...integer(id), ...struct([])]),
          98370,
        ),
      ).toThrow('event id')
    expect(() =>
      parseReplayTrackerEvents(
        Uint8Array.from([...delta(4294967296), ...integer(9), ...struct([])]),
        98370,
      ),
    ).toThrow('bounds')
  })
  it('reads little-endian attribute records with exact count and byte-view offsets', () => {
    const bytes = new Uint8Array(22)
    const view = new DataView(bytes.buffer)
    bytes[0] = 5
    view.setUint32(1, 0x12345678, true)
    view.setUint32(5, 1, true)
    view.setUint32(9, 999, true)
    view.setUint32(13, 3000, true)
    bytes[17] = 2
    bytes.set([0, 114, 101, 84], 18)
    expect(parseReplayAttributes(bytes)).toMatchObject({
      source: 5,
      mapNamespace: 0x12345678,
      attributes: [{ namespace: 999, attributeId: 3000, scope: 2, value: 'Ter' }],
    })
    const padded = Uint8Array.from([0, ...bytes, 0])
    expect(parseReplayAttributes(padded.subarray(1, -1))).toEqual(parseReplayAttributes(bytes))
    expect(() => parseReplayAttributes(bytes.subarray(0, -1))).toThrow('count')
    expect(() => parseReplayAttributes(new Uint8Array(8))).toThrow('header')
  })
  it('allows a lower tracker event budget but never silently truncates', () => {
    const event = [...delta(0), ...integer(9), ...struct([])]
    expect(() =>
      parseReplayTrackerEvents(Uint8Array.from([...event, ...event]), 70154, { maxEvents: 1 }),
    ).toThrow('event limit exceeded')
    expect(() => parseReplayTrackerEvents(new Uint8Array(), 70154, { maxEvents: 0 })).toThrow(
      'maxEvents',
    )
  })
  it('enforces byte and collection limits before allocation', () => {
    expect(() => parseReplayInitData(new Uint8Array(4 * 1024 * 1024 + 1), 70154)).toThrow('limit')
    expect(() => parseReplayTrackerEvents(new Uint8Array(32 * 1024 * 1024 + 1), 70154)).toThrow(
      'limit',
    )
    const schema: ProtocolSchema = {
      initData: 0,
      delta: 0,
      eventId: 0,
      events: {},
      types: { 0: ['_array', [[0, 32], 0]] },
    }
    const writer = new Writer()
    writer.bits(100_001n, 32)
    expect(() => new ProtocolDecoder(schema, new ReplayBitReader(writer.data())).decode(0)).toThrow(
      'array limit',
    )
  })
})
