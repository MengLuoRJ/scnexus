import { UnsupportedReplayProtocolError } from './protocol-schema.js'
import type { Bounds, TrackerProtocolSchema } from './protocol-schema.js'
import type { VersionedValue } from './versioned.js'

export type ReplayBlob = { kind: 'blob'; hex: string; text: string | null }
export type ReplayProtocolValue =
  | number
  | string
  | boolean
  | null
  | ReplayBlob
  | ReplayProtocolValue[]
  | { [field: string]: ReplayProtocolValue }

export function replayBlob(bytes: Uint8Array): ReplayBlob {
  let text: string | null = null
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // Binary cache handles are valid blobs, not malformed UTF-8 text.
  }
  return {
    kind: 'blob',
    hex: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''),
    text,
  }
}

function jsonInteger(value: bigint): number | string {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : value.toString()
}

/** Low bits are consumed first within each byte; successive chunks form a big-endian integer. */
export class ReplayBitReader {
  position = 0
  constructor(readonly data: Uint8Array) {}

  bits(width: number): bigint {
    if (
      !Number.isInteger(width) ||
      width < 0 ||
      width > 64 ||
      this.position + width > this.data.length * 8
    )
      throw new Error('Truncated or invalid bit-packed replay data')
    let result = 0n
    let remaining = width
    while (remaining > 0) {
      const shift = this.position % 8
      const take = Math.min(8 - shift, remaining)
      const chunk = (this.data[Math.floor(this.position / 8)]! >>> shift) & ((1 << take) - 1)
      result = (result << BigInt(take)) | BigInt(chunk)
      this.position += take
      remaining -= take
    }
    return result
  }

  alignedBytes(length: number): Uint8Array {
    this.position = Math.ceil(this.position / 8) * 8
    const start = this.position / 8
    if (!Number.isSafeInteger(length) || length < 0 || length > this.data.length - start)
      throw new Error('Truncated bit-packed blob')
    this.position += length * 8
    return this.data.subarray(start, start + length)
  }

  integer([minimum, width]: Bounds): bigint {
    return BigInt(minimum) + this.bits(width)
  }
}

export class ProtocolDecoder {
  private nodes = 0
  constructor(
    readonly schema: TrackerProtocolSchema,
    readonly reader?: ReplayBitReader,
    readonly strictFields = false,
  ) {}

  decode(typeId: number, raw?: VersionedValue, depth = 0): ReplayProtocolValue {
    if (++this.nodes > 1_000_000 || depth > 64)
      throw new Error('Replay protocol decoding limit exceeded')
    const type = this.schema.types[typeId]
    if (!type) throw new Error(`Unknown protocol type: ${typeId}`)
    const child = (id: number, value?: VersionedValue) => this.decode(id, value, depth + 1)
    const reader = this.reader
    const invalid = (): never => {
      throw new Error(`Invalid versioned value for ${type[0]}`)
    }
    switch (type[0]) {
      case '_int': {
        const value = reader
          ? reader.integer(type[1][0])
          : typeof raw === 'bigint'
            ? raw
            : invalid()
        const [minimum, width] = type[1][0]
        if (value < BigInt(minimum) || value >= BigInt(minimum) + (1n << BigInt(width)))
          throw new Error('Protocol integer outside schema bounds')
        return jsonInteger(value)
      }
      case '_bool':
        return reader ? reader.bits(1) !== 0n : typeof raw === 'bigint' ? raw !== 0n : invalid()
      case '_blob':
        return replayBlob(
          reader
            ? reader.alignedBytes(Number(reader.integer(type[1][0])))
            : raw instanceof Uint8Array
              ? raw
              : invalid(),
        )
      case '_bitarray': {
        if (!reader) return raw instanceof Uint8Array ? replayBlob(raw) : invalid()
        const length = Number(reader.integer(type[1][0]))
        if (length > 65_536) throw new Error('Replay bitarray limit exceeded')
        let value = 0n
        let remaining = length
        while (remaining > 0) {
          const width = Math.min(8 - (reader.position % 8), remaining)
          value = (value << BigInt(width)) | reader.bits(width)
          remaining -= width
        }
        return { bitLength: length, value: value.toString() }
      }
      case '_optional':
        return (reader ? reader.bits(1) === 0n : raw === null) ? null : child(type[1][0], raw)
      case '_array': {
        const length = reader
          ? Number(reader.integer(type[1][0]))
          : Array.isArray(raw)
            ? raw.length
            : invalid()
        if (length > 100_000) throw new Error('Replay array limit exceeded')
        return Array.from({ length }, (_, i) =>
          child(type[1][1], Array.isArray(raw) ? raw[i] : undefined),
        )
      }
      case '_choice': {
        const tag = reader
          ? Number(reader.integer(type[1][0]))
          : raw instanceof Map && raw.size === 1
            ? raw.keys().next().value!
            : invalid()
        const field = type[1][1][tag]
        if (!field) throw new Error(`Unknown protocol choice: ${tag}`)
        return { [field[0]]: child(field[1], raw instanceof Map ? raw.get(tag) : undefined) }
      }
      case '_struct': {
        if (!reader && !(raw instanceof Map)) return invalid()
        if (this.strictFields && raw instanceof Map) {
          const tags = new Set(type[1][0].map((field) => field[2]))
          for (const tag of raw.keys()) {
            if (!tags.has(tag))
              throw new UnsupportedReplayProtocolError(`Unverified tracker field tag: ${tag}`)
          }
          for (const [name, id, tag] of type[1][0]) {
            if (!raw.has(tag) && this.schema.types[id]?.[0] !== '_optional')
              throw new UnsupportedReplayProtocolError(`Missing verified tracker field: ${name}`)
          }
        }
        const result: Record<string, ReplayProtocolValue> = {}
        for (const [name, id, tag] of type[1][0]) {
          if (!reader && raw instanceof Map && !raw.has(tag)) continue
          result[name] = child(id, raw instanceof Map ? raw.get(tag) : undefined)
        }
        return result
      }
    }
  }
}
