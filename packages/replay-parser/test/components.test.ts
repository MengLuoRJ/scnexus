import { describe, expect, it } from 'vitest'
import {
  parseReplayAttributes,
  parseReplayInitData,
  parseReplayTrackerEvents,
  UnsupportedReplayBuildError,
  SUPPORTED_REPLAY_BASE_BUILDS,
} from '../src/index.js'
import { ProtocolDecoder, ReplayBitReader } from '../src/protocol-decoder.js'
import { replayProtocol } from '../src/protocol-schema.js'
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
    expect(SUPPORTED_REPLAY_BASE_BUILDS).toEqual([70154, 98310])
    for (const build of [0, 70153, 70326, 98311, NaN]) {
      expect(() => parseReplayInitData(new Uint8Array(), build)).toThrow(
        UnsupportedReplayBuildError,
      )
      expect(() => parseReplayTrackerEvents(new Uint8Array(), build)).toThrow(
        UnsupportedReplayBuildError,
      )
    }
  })
  it.each([70154, 98310])('decodes complete synthetic initData for %i', (build) => {
    const schema = replayProtocol(build)
    const writer = new Writer()
    writer.minimal(schema, schema.initData)
    const bytes = writer.data()
    const result = parseReplayInitData(bytes, build)
    expect(result.protocolVersion).toBe(`s2protocol-${build}`)
    expect(result.data).toHaveProperty('m_syncLobbyState.m_gameDescription.m_gameSpeed', 0)
    expect(() => JSON.stringify(result)).not.toThrow(/Truncated|Invalid/)
    expect(() => parseReplayInitData(bytes.subarray(0, -1), build)).toThrow(/Truncated|Invalid/)
    expect(() => parseReplayInitData(Uint8Array.from([...bytes, 0]), build)).toThrow('Trailing')
  })
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
      expect(() =>
        parseReplayTrackerEvents(
          Uint8Array.from([...delta(0), ...integer(15), ...struct([])]),
          build,
        ),
      ).toThrow('Unknown tracker event')
      expect(() =>
        parseReplayTrackerEvents(
          Uint8Array.from([...delta(-1), ...integer(9), ...struct([])]),
          build,
        ),
      ).toThrow('bounds')
    },
  )
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
