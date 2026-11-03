import { describe, expect, it } from 'vitest'
import { ProtocolDecoder, ReplayBitReader } from '../src/protocol-decoder.js'
import type { ProtocolType, TrackerProtocolSchema } from '../src/protocol-schema.js'
import {
  INIT_PROTOCOL_GROUPS,
  GAME_PROTOCOL_GROUPS,
  MESSAGE_PROTOCOL_GROUPS,
  TRACKER_PROTOCOL_GROUPS,
  HEADER_PROTOCOL_GROUPS,
  DETAILS_PROTOCOL_GROUPS,
} from '../src/protocols/game-registry.js'

class Writer {
  bytes: number[] = []
  position = 0
  bits(value: bigint, width: number): void {
    while (width) {
      const shift = this.position % 8
      const take = Math.min(8 - shift, width)
      width -= take
      const index = Math.floor(this.position / 8)
      this.bytes[index] =
        (this.bytes[index] ?? 0) |
        (Number((value >> BigInt(width)) & ((1n << BigInt(take)) - 1n)) << shift)
      this.position += take
    }
  }
  minimal(types: Record<number, ProtocolType>, id: number): void {
    const type = types[id]!
    switch (type[0]) {
      case '_null':
        break
      case '_fourcc':
        this.bits(0n, 32)
        break
      case '_int':
        this.bits(0n, type[1][0][1])
        break
      case '_bool':
      case '_optional':
        this.bits(0n, 1)
        break
      case '_array': {
        const [minimum, width] = type[1][0]
        this.bits(0n, width)
        for (let i = 0; i < minimum; i++) this.minimal(types, type[1][1])
        break
      }
      case '_blob': {
        const [minimum, width] = type[1][0]
        this.bits(0n, width)
        this.position = Math.ceil(this.position / 8) * 8
        for (let i = 0; i < minimum; i++) this.bits(0n, 8)
        break
      }
      case '_bitarray': {
        const [minimum, width] = type[1][0]
        this.bits(0n, width)
        for (let i = 0; i < minimum; i++) this.bits(0n, 1)
        break
      }
      case '_struct':
        for (const [, child] of type[1][0]) this.minimal(types, child)
        break
      case '_choice': {
        const [tag, [, child]] = Object.entries(type[1][1])[0]!
        this.bits(BigInt(Number(tag) - type[1][0][0]), type[1][0][1])
        this.minimal(types, child)
      }
    }
  }
  data(): Uint8Array {
    return Uint8Array.from(
      Array.from({ length: Math.ceil(this.position / 8) }, (_, i) => this.bytes[i] ?? 0),
    )
  }
}

const registries = [
  ['init', INIT_PROTOCOL_GROUPS, 17],
  ['game', GAME_PROTOCOL_GROUPS, 14],
  ['message', MESSAGE_PROTOCOL_GROUPS, 5],
  ['tracker', TRACKER_PROTOCOL_GROUPS, 3],
  ['header', HEADER_PROTOCOL_GROUPS, 3],
  ['details', DETAILS_PROTOCOL_GROUPS, 7],
] as const

describe('pinned complete official protocol data', () => {
  it.each(registries)(
    'validates every reachable %s root and group membership',
    (_name, groups, count) => {
      expect(groups).toHaveLength(count)
      const builds = groups.flatMap((group) => [...group.builds])
      expect(new Set(builds).size).toBe(builds.length)
      expect(builds.length).toBe(_name === 'tracker' ? 75 : 93)
      expect(new Set(groups.map((group) => group.fingerprint)).size).toBe(count)
      const visited = new Set<number>()
      function visit(schema: TrackerProtocolSchema, id: number): void {
        if (visited.has(id)) return
        visited.add(id)
        const type = schema.types[id]
        expect(type, `missing type ${id}`).toBeDefined()
        if (!type) throw new Error('Missing protocol type')
        switch (type[0]) {
          case '_array':
            visit(schema, type[1][1])
            break
          case '_optional':
            visit(schema, type[1][0])
            break
          case '_struct':
            for (const [, child] of type[1][0]) visit(schema, child)
            break
          case '_choice':
            for (const [, child] of Object.values(type[1][1])) visit(schema, child)
            break
        }
      }
      for (const { schema } of groups) {
        const roots =
          'initData' in schema
            ? [schema.initData]
            : [
                schema.delta,
                schema.eventId,
                ...('userId' in schema && schema.userId !== undefined ? [schema.userId] : []),
                ...Object.values(schema.events).map(([id]) => id),
              ]
        for (const root of roots) visit(schema, root)
      }
    },
  )

  it.each(GAME_PROTOCOL_GROUPS)(
    'fully consumes every game body in group $sourceBuild',
    ({ schema }) => {
      for (const [id, [body]] of Object.entries(schema.events)) {
        const writer = new Writer()
        writer.minimal(schema.types, schema.delta)
        if (schema.userId !== undefined) writer.minimal(schema.types, schema.userId)
        const eventId = schema.types[schema.eventId]!
        if (eventId[0] !== '_int') throw new Error('Expected integer event id')
        writer.bits(BigInt(Number(id) - eventId[1][0][0]), eventId[1][0][1])
        writer.minimal(schema.types, body)
        const reader = new ReplayBitReader(writer.data())
        const decoder = new ProtocolDecoder(schema, reader)
        decoder.decode(schema.delta)
        if (schema.userId !== undefined) decoder.decode(schema.userId)
        expect(decoder.decode(schema.eventId)).toBe(Number(id))
        decoder.decode(body)
        expect(reader.position).toBe(writer.position)
      }
    },
  )
})
