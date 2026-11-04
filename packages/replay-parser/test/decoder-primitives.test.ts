import { describe, expect, it } from 'vitest'
import { ProtocolDecoder, ReplayBitReader, replayBlob } from '../src/protocol-decoder.js'
import { decodeVersionedPrefix, versionedText } from '../src/versioned.js'
import type { TrackerProtocolSchema } from '../src/protocol-schema.js'

function vint(value: bigint): number[] {
  const negative = value < 0n
  let remaining = negative ? -value : value
  const bytes = [Number(remaining & 63n) * 2 + Number(negative)]
  remaining >>= 6n
  while (remaining) {
    bytes[bytes.length - 1]! |= 128
    bytes.push(Number(remaining & 127n))
    remaining >>= 7n
  }
  return bytes
}

const decode = (bytes: number[], strict = false) =>
  decodeVersionedPrefix(Uint8Array.from(bytes), 0, strict)

const schema: TrackerProtocolSchema = {
  delta: 0,
  eventId: 0,
  events: {},
  types: {
    0: ['_int', [[0, 64]]],
    1: ['_struct', [[['value', 0, 0]]]],
    2: ['_optional', [0]],
  },
}

describe('versioned decoder primitives', () => {
  it.each([
    0n,
    63n,
    64n,
    -64n,
    (1n << 41n) - 1n,
    1n << 41n,
    (1n << 48n) - 1n,
    1n << 48n,
    BigInt(Number.MAX_SAFE_INTEGER),
    1n << 63n,
    (1n << 64n) - 1n,
    -((1n << 64n) - 1n),
  ])('preserves exact signed integer %s', (value) => {
    const bytes = [9, ...vint(value)]
    expect(decode(bytes)).toMatchObject({ value, nextOffset: bytes.length })
  })

  it('preserves signed zero and accepted padded integer encodings', () => {
    expect(decode([9, 1]).value).toBe(0n)
    expect(decode([9, 128, 128, 0]).value).toBe(0n)
    expect(decode([9, ...Array<number>(10).fill(128), 0]).value).toBe(0n)
    expect(() => decode([9, ...Array<number>(11).fill(128), 0])).toThrow('64-bit')
  })

  it('rejects overflow and every truncated prefix of a long integer', () => {
    expect(() => decode([9, ...vint(1n << 64n)])).toThrow('64-bit')
    const bytes = [9, ...vint((1n << 64n) - 1n)]
    for (let length = 0; length < bytes.length; length++)
      expect(() => decode(bytes.slice(0, length))).toThrow('Truncated')
  })

  it('retains duplicate, signed tag and collection validation', () => {
    expect(() => decode([5, 4, 0, 9, 0, 0, 9, 2])).toThrow('Duplicate')
    expect(decode([5, 2, 1, 9, 2]).value).toEqual(new Map([[-0, 1n]]))
    expect(decode([3, ...vint(-2n), 9, 2]).value).toEqual(new Map([[-2, 1n]]))
    for (const type of [3, 5]) {
      const prefix = type === 5 ? [5, 2] : [3]
      expect(() => decode([...prefix, ...vint(1n << 53n), 9, 0])).toThrow('tag')
    }
    for (const type of [0, 1, 2, 5]) {
      expect(() => decode([type, ...vint(-1n)])).toThrow('collection length')
      expect(() => decode([type, ...vint(1000n)])).toThrow('collection length')
    }
    expect(() => decode([2, 4, 65])).toThrow('Truncated')
    expect(() => decode([7, 1, 2, 3])).toThrow('Truncated')
    expect(() => decode([8, 1, 2, 3])).toThrow('Truncated')
  })

  it('preserves optional wire children and strict markers', () => {
    const result = decode([5, 2, 0, 4, 1, 9, 6])
    expect(result.value).toEqual(new Map([[0, 3n]]))
    expect(result.wire.children.get(0)?.children.get(0)).toEqual({ type: 9, children: new Map() })
    expect(
      new ProtocolDecoder({
        ...schema,
        types: { ...schema.types, 1: ['_struct', [[['value', 2, 0]]]] },
      }).decode(1, result.value, 0, result.wire),
    ).toEqual({ value: 3 })
    expect(decode([4, 2, 9, 6]).value).toBe(3n)
    expect(() => decode([4, 2, 9, 6], true)).toThrow('optional marker')
    expect(() => new ProtocolDecoder(schema).decode(0, result.value, 0, result.wire)).toThrow(
      'Wrong wire',
    )
  })

  it('keeps the 100,000-node budget including scalar children', () => {
    const array = (length: number) => [
      0,
      ...vint(BigInt(length)),
      ...Array<number>(length)
        .fill(6)
        .flatMap((type) => [type, 0]),
    ]
    expect(decode(array(99_999)).value).toHaveLength(99_999)
    expect(() => decode(array(100_000))).toThrow('limit')
  })

  it('retains signed field tags up to safe integer limits', () => {
    for (const tag of [-BigInt(Number.MAX_SAFE_INTEGER), BigInt(Number.MAX_SAFE_INTEGER), -2n]) {
      expect(decode([5, 2, ...vint(tag), 9, 2]).value).toEqual(new Map([[Number(tag), 1n]]))
    }
  })

  it('preserves schema bounds, exact JSON integers and strict fields', () => {
    const decoder = () => new ProtocolDecoder(schema, undefined, true)
    expect(decoder().decode(0, (1n << 64n) - 1n)).toBe('18446744073709551615')
    expect(decoder().decode(0, 1n)).toBe(1)
    for (const value of [-1n, 1n << 64n])
      expect(() => decoder().decode(0, value)).toThrow('schema bounds')
    expect(() => decoder().decode(1, new Map([[1, 1n]]))).toThrow('Unverified tracker field')
    expect(() => decoder().decode(1, new Map())).toThrow('Missing verified tracker field')
  })

  it('retains offset, byte-view and nesting limits', () => {
    const buffer = Uint8Array.of(255, 9, 6, 255)
    expect(decodeVersionedPrefix(buffer.subarray(1, 3))).toMatchObject({ value: 3n, nextOffset: 2 })
    expect(decodeVersionedPrefix(buffer, 1).nextOffset).toBe(3)
    for (const start of [-1, 0.5, 5, NaN])
      expect(() => decodeVersionedPrefix(buffer, start)).toThrow('offset')
    expect(() => decode([...Array.from({ length: 65 }, () => [4, 1]).flat(), 9, 0])).toThrow(
      'limit',
    )
  })
})

describe('bit and blob hot paths', () => {
  it('matches chunk-order reference for every width and starting alignment', () => {
    const data = Uint8Array.from({ length: 10 }, (_, i) => (i * 71 + 193) & 255)
    for (let start = 0; start < 8; start++) {
      for (let width = 0; width <= 64; width++) {
        let expected = 0n
        let position = start
        let remaining = width
        while (remaining) {
          const take = Math.min(8 - (position % 8), remaining)
          const chunk = (data[Math.floor(position / 8)]! >>> (position % 8)) & ((1 << take) - 1)
          expected = expected * (1n << BigInt(take)) + BigInt(chunk)
          position += take
          remaining -= take
        }
        const reader = new ReplayBitReader(data)
        reader.position = start
        expect(reader.bits(width)).toBe(expected)
        expect(reader.position).toBe(start + width)
      }
    }
    expect(new ReplayBitReader(Uint8Array.of(255, 255, 255, 255)).bits(32)).toBe(0xffffffffn)
    for (const width of [-1, 0.5, 65, NaN, 9]) {
      const reader = new ReplayBitReader(Uint8Array.of(255))
      expect(() => reader.bits(width)).toThrow('Truncated or invalid')
      expect(reader.position).toBe(0)
    }
  })

  it('retains hex and fatal UTF-8 behavior across successive decodes', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect(replayBlob(bytes)).toEqual({
      kind: 'blob',
      hex: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''),
      text: null,
    })
    for (let i = 0; i < 3; i++) {
      expect(replayBlob(Uint8Array.of(0xe4))).toEqual({ kind: 'blob', hex: 'e4', text: null })
      expect(() => versionedText(Uint8Array.of(0xe4))).toThrow(TypeError)
      const valid = new TextEncoder().encode('\ufeff中文')
      expect(replayBlob(valid).text).toBe('中文')
      expect(versionedText(valid)).toBe('中文')
      expect(replayBlob(new Uint8Array())).toEqual({ kind: 'blob', hex: '', text: '' })
    }
    expect(versionedText(null)).toBeNull()
  })
})
