import { describe, expect, it } from 'vitest'
import vectors from './vectors.json'
import { Bzip2Error, decompressBzip2 } from '../src/index.js'

const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))
const text = new TextEncoder().encode('Hello, StarCraft II!\n'.repeat(7))
const compressed = fromHex(vectors.text.compressedHex)

describe('decompressBzip2', () => {
  it('decodes an empty stream', () => {
    expect(decompressBzip2(fromHex(vectors.empty.compressedHex), 0)).toEqual(new Uint8Array())
  })
  it('decodes public synthetic text and binary vectors', () => {
    expect(decompressBzip2(compressed, text.length)).toEqual(text)
    expect(decompressBzip2(fromHex(vectors.binary.compressedHex), vectors.binary.size)).toEqual(
      Uint8Array.from({ length: 256 * 11 }, (_, i) => i % 256),
    )
  })
  it('decodes multiple 100k blocks', () => {
    expect(
      decompressBzip2(fromHex(vectors.multiBlock.compressedHex), vectors.multiBlock.size),
    ).toEqual(Uint8Array.from({ length: 350000 }, (_, i) => (i * 73 + Math.floor(i / 256)) % 256))
  })
  it('honors input subarray offsets without modifying input', () => {
    const padded = new Uint8Array(compressed.length + 10)
    padded.set(compressed, 4)
    const original = padded.slice()
    expect(decompressBzip2(padded.subarray(4, 4 + compressed.length), text.length)).toEqual(text)
    expect(padded).toEqual(original)
  })
  it('returns independent output and supports repeated calls after errors', () => {
    const first = decompressBzip2(compressed, text.length)
    expect(() => decompressBzip2(compressed.subarray(0, 10), text.length)).toThrow(/bzip2/)
    expect(decompressBzip2(compressed, text.length)).toEqual(text)
    expect(first).toEqual(text)
  })
  it('rejects trailing bytes and concatenated streams', () => {
    for (const suffix of [new Uint8Array([0]), compressed]) {
      const joined = new Uint8Array(compressed.length + suffix.length)
      joined.set(compressed)
      joined.set(suffix, compressed.length)
      expect(() => decompressBzip2(joined, text.length)).toThrow(/trailing/)
    }
  })
  it('rejects incorrect output lengths, including zero', () => {
    for (const size of [0, text.length - 1, text.length + 1]) {
      expect(() => decompressBzip2(compressed, size)).toThrow(/size mismatch/)
    }
    expect(() => decompressBzip2(fromHex(vectors.empty.compressedHex), 1)).toThrow(/size mismatch/)
  })
  it('rejects every truncated prefix', () => {
    for (let length = 0; length < compressed.length; length++) {
      expect(() => decompressBzip2(compressed.subarray(0, length), text.length)).toThrow(/bzip2/)
    }
  })
  it('rejects bad magic and block/combined CRC corruption', () => {
    for (const offset of [0, 10, compressed.length - 2]) {
      const corrupt = compressed.slice()
      corrupt[offset] ^= 0x80
      expect(() => decompressBzip2(corrupt, text.length)).toThrow(/bzip2/)
    }
  })
  it('rejects invalid sizes before allocating WASM buffers', () => {
    for (const size of [-1, 0.5, NaN, Infinity, 128 * 1024 * 1024 + 1]) {
      expect(() => decompressBzip2(compressed, size)).toThrow(Bzip2Error)
    }
    expect(() => decompressBzip2(new Uint8Array(), 0)).toThrow(Bzip2Error)
    expect(() => decompressBzip2(new Uint8Array(128 * 1024 * 1024 + 1), 0)).toThrow(Bzip2Error)
  })
  it('decodes at the output bound with memory growth', () => {
    // 128 MiB of zeros, compressed by Python bz2; the fixture is only 112 bytes.
    const packed = fromHex(vectors.maxOutput.compressedHex)
    const output = decompressBzip2(packed, 128 * 1024 * 1024)
    expect(output.length).toBe(128 * 1024 * 1024)
    expect(output.every((value) => value === 0)).toBe(true)
  })
})
