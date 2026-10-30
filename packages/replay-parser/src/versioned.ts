export type VersionedValue =
  | bigint
  | Uint8Array
  | VersionedValue[]
  | Map<number, VersionedValue>
  | null

/** Self-describing wire types used by replay.header and replay.details, not bit-packed event streams. */
export function decodeVersioned(data: Uint8Array): VersionedValue {
  let offset = 0
  let nodes = 0
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  function bytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > data.length - offset) {
      throw new Error('Truncated versioned replay data')
    }
    const result = data.subarray(offset, offset + length)
    offset += length
    return result
  }

  function byte(): number {
    return bytes(1)[0]!
  }

  function integer(): bigint {
    let value = byte()
    const negative = (value & 1) !== 0
    let result = BigInt((value >>> 1) & 63)
    let shift = 6n
    while (value & 128) {
      if (shift > 69n) throw new Error('Versioned integer exceeds 64-bit range')
      value = byte()
      result |= BigInt(value & 127) << shift
      shift += 7n
    }
    if (result > 0xffffffffffffffffn) throw new Error('Versioned integer exceeds 64-bit range')
    return negative ? -result : result
  }

  function count(): number {
    const value = integer()
    if (value < 0n || value > BigInt(data.length))
      throw new Error('Invalid versioned collection length')
    return Number(value)
  }

  function read(depth: number): VersionedValue {
    if (depth > 64 || ++nodes > 100_000) throw new Error('Versioned replay decoding limit exceeded')
    const type = byte()
    switch (type) {
      case 0: {
        const length = count()
        return Array.from({ length }, () => read(depth + 1))
      }
      case 1:
        return bytes(Math.ceil(count() / 8))
      case 2:
        return bytes(count())
      case 3: {
        const tag = integer()
        if (tag < BigInt(Number.MIN_SAFE_INTEGER) || tag > BigInt(Number.MAX_SAFE_INTEGER))
          throw new Error('Invalid choice tag')
        return new Map([[Number(tag), read(depth + 1)]])
      }
      case 4:
        return byte() === 0 ? null : read(depth + 1)
      case 5: {
        const length = count()
        const fields = new Map<number, VersionedValue>()
        for (let i = 0; i < length; i++) {
          const tag = integer()
          if (tag < BigInt(Number.MIN_SAFE_INTEGER) || tag > BigInt(Number.MAX_SAFE_INTEGER))
            throw new Error('Invalid field tag')
          const key = Number(tag)
          if (fields.has(key)) throw new Error('Duplicate versioned field tag')
          fields.set(key, read(depth + 1))
        }
        return fields
      }
      case 6:
        return BigInt(byte())
      case 7:
        return bytes(4)
      case 8: {
        bytes(8)
        return view.getBigUint64(offset - 8, true)
      }
      case 9:
        return integer()
      default:
        throw new Error(`Unknown versioned wire type: ${type}`)
    }
  }

  return read(0)
}

export function versionedStruct(value: VersionedValue | undefined): Map<number, VersionedValue> {
  if (!(value instanceof Map)) throw new Error('Expected a versioned struct')
  return value
}

export function versionedNumber(value: VersionedValue | undefined): number | null {
  return typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : null
}

export function versionedText(value: VersionedValue | undefined): string | null {
  return value instanceof Uint8Array
    ? new TextDecoder('utf-8', { fatal: true }).decode(value)
    : null
}
