import { describe, expect, it } from 'vitest'
import { parseReplayMessageEvents } from '../src/message-events.js'
import {
  REPLAY_PROTOCOL_ALGORITHM_VERSION,
  UnsupportedReplayBuildError,
  UnsupportedReplayProtocolError,
} from '../src/protocol-schema.js'
import type { MessageProtocolSchema } from '../src/protocol-schema.js'
import {
  MESSAGE_PROTOCOL_GROUPS,
  findReplayMessageProtocol,
  findReplayProtocolCandidates,
} from '../src/protocols/game-registry.js'

class Bits {
  private bytes: number[] = []
  private position = 0

  bits(value: number, width: number): this {
    let remaining = width
    while (remaining > 0) {
      const shift = this.position % 8
      const take = Math.min(8 - shift, remaining)
      const chunk = Number(
        (BigInt(value) >> BigInt(remaining - take)) & ((1n << BigInt(take)) - 1n),
      )
      const index = Math.floor(this.position / 8)
      this.bytes[index] = (this.bytes[index] ?? 0) | (chunk << shift)
      this.position += take
      remaining -= take
    }
    return this
  }

  align(): this {
    return this.bits(0, (8 - (this.position % 8)) % 8)
  }

  blob(bytes: Uint8Array): this {
    this.bits(bytes.length, 11).align()
    for (const byte of bytes) this.bits(byte, 8)
    return this
  }

  data(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

const modern = findReplayMessageProtocol(98310)!.schema
function header(
  bits: Bits,
  schema: MessageProtocolSchema,
  eventId: number,
  delta = 0,
  userId = 7,
): Bits {
  const widths = [6, 14, 22, 32]
  const tag = widths.findIndex((width) => delta < 2 ** width)
  bits.bits(tag, 2).bits(delta, widths[tag]!)
  if (schema.userId !== undefined) bits.bits(userId, 5)
  return bits.bits(eventId, 4)
}
function recipientWidth(schema: MessageProtocolSchema): number {
  const chat = schema.types[schema.events[0]![0]]!
  if (chat[0] !== '_struct') throw new Error('Expected chat struct')
  const recipient = schema.types[chat[1][0][0]![1]]!
  if (recipient[0] !== '_int') throw new Error('Expected recipient integer')
  return recipient[1][0][1]
}
function chat(
  schema = modern,
  text = new TextEncoder().encode('你好 gg'),
  recipient = 2,
): Uint8Array {
  return header(new Bits(), schema, 0, 16)
    .bits(recipient, recipientWidth(schema))
    .blob(text)
    .align()
    .data()
}

function concat(...parts: Uint8Array[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => [...part]))
}

describe('bounded official bit-packed message events', () => {
  it('decodes chat blobs, recipients, raw user ids and protocol provenance', () => {
    expect(parseReplayMessageEvents(chat(), 98310)).toMatchObject({
      baseBuild: 98310,
      protocolVersion: `s2protocol-${findReplayMessageProtocol(98310)!.sourceBuild}`,
      algorithmVersion: REPLAY_PROTOCOL_ALGORITHM_VERSION,
      compatibility: { state: 'verified' },
      processedEvents: 1,
      skippedEvents: 0,
      elapsedGameLoops: 16,
      events: [
        {
          eventId: 0,
          eventType: 'NNet.Game.SChatMessage',
          gameLoop: 16,
          userId: 7,
          data: {
            m_recipient: 2,
            m_string: { kind: 'blob', text: '你好 gg', hex: 'e4bda0e5a5bd206767' },
          },
        },
      ],
    })
  })

  it('decodes representative inline chat streams for every exact official build', () => {
    for (const group of MESSAGE_PROTOCOL_GROUPS) {
      const data = chat(group.schema)
      for (const build of group.builds) {
        const result = parseReplayMessageEvents(data, build, { allowUnverified: false })
        expect(result.compatibility).toEqual({
          state: 'verified',
          protocolBuild: group.sourceBuild,
          candidateBuilds: [group.sourceBuild],
        })
        expect(result.events[0]!.userId).toBe(group.schema.userId === undefined ? -1 : 7)
        expect(result.events[0]!.data.m_string).toMatchObject({ text: '你好 gg' })
      }
    }
  })

  it('retains ping, loading, server ping and reconnect bodies and their elapsed loops', () => {
    const bits = new Bits()
    header(bits, modern, 1, 63).bits(4, 3).bits(0, 32).bits(0xffffffff, 32).align()
    header(bits, modern, 2, 64).bits(2147483748, 32).align()
    header(bits, modern, 3, 16384).align()
    header(bits, modern, 4, 4194304).bits(2, 2).align()
    const result = parseReplayMessageEvents(bits.data(), 98310)
    expect(result).toMatchObject({
      processedEvents: 4,
      skippedEvents: 0,
      elapsedGameLoops: 4210815,
    })
    expect(result.events.map((event) => event.data)).toEqual([
      { m_recipient: 4, m_point: { x: -2147483648, y: 2147483647 } },
      { m_progress: 100 },
      {},
      { m_status: 2 },
    ])
    expect(result.events.map((event) => event.gameLoop)).toEqual([63, 127, 16511, 4210815])
  })

  it('preserves empty and non-UTF8 chat as blobs without inventing text', () => {
    const result = parseReplayMessageEvents(
      concat(chat(modern, new Uint8Array()), chat(modern, Uint8Array.of(255))),
      98310,
    )
    expect(result.events.map((event) => event.data.m_string)).toEqual([
      { kind: 'blob', hex: '', text: '' },
      { kind: 'blob', hex: 'ff', text: null },
    ])
    expect(result.elapsedGameLoops).toBe(32)
  })

  it.each([
    { bytes: [0xef, 0xbc, 0x8c], hex: 'efbc8c', text: '，' },
    {
      bytes: [0xe8, 0xa6, 0x81, 0xe5, 0xb9, 0xb2, 0xe5, 0x98, 0x9b],
      hex: 'e8a681e5b9b2e5989b',
      text: '要干嘛',
    },
  ])('preserves CN replay UTF-8 payload $hex exactly', ({ bytes, hex, text }) => {
    const result = parseReplayMessageEvents(chat(modern, Uint8Array.from(bytes)), 98310)
    expect(result.events[0]!.data.m_string).toEqual({ kind: 'blob', hex, text })
  })

  it('preserves legacy-looking and malformed UTF-8 bytes without replacement or locale guessing', () => {
    // GBK bytes for 你好 are not valid UTF-8; encoding is not established by the replay locale.
    const payloads = [
      Uint8Array.of(0xc4, 0xe3, 0xba, 0xc3),
      Uint8Array.of(0xe4, 0xbd),
      Uint8Array.of(0xc0, 0xaf),
      Uint8Array.of(0xed, 0xa0, 0x80),
    ]
    const result = parseReplayMessageEvents(
      concat(...payloads.map((bytes) => chat(modern, bytes))),
      98310,
    )
    expect(result.events.map((event) => event.data.m_string)).toEqual([
      { kind: 'blob', hex: 'c4e3bac3', text: null },
      { kind: 'blob', hex: 'e4bd', text: null },
      { kind: 'blob', hex: 'c0af', text: null },
      { kind: 'blob', hex: 'eda080', text: null },
    ])
    expect(result.events.every((event) => event.eventType === 'NNet.Game.SChatMessage')).toBe(true)
  })

  it('accepts known empty streams but rejects truncated bodies and trailing garbage', () => {
    expect(parseReplayMessageEvents(new Uint8Array(), 98310)).toMatchObject({
      processedEvents: 0,
      skippedEvents: 0,
      elapsedGameLoops: 0,
      events: [],
    })
    const bytes = chat()
    for (let length = 1; length < bytes.length; length++) {
      expect(() => parseReplayMessageEvents(bytes.subarray(0, length), 98310)).toThrow(/Truncated/)
    }
    expect(() => parseReplayMessageEvents(concat(bytes, Uint8Array.of(0)), 98310)).toThrow(
      /Truncated/,
    )
  })

  it('rejects unknown ids instead of guessing boundaries or silently returning partial results', () => {
    const unknown = header(new Bits(), modern, 15).align().data()
    expect(() => parseReplayMessageEvents(concat(chat(), unknown), 98310)).toThrow(
      'Unknown message event id 15; boundary unavailable',
    )
  })

  it('never falls back for a malformed known build', () => {
    const old = findReplayMessageProtocol(15405)!.schema
    const laterServerPing = header(new Bits(), old, 3).align().data()
    expect(parseReplayMessageEvents(laterServerPing, 16561).processedEvents).toBe(1)
    expect(() => parseReplayMessageEvents(laterServerPing, 15405)).toThrow(
      'Unknown message event id 3',
    )
  })

  it('tries at most three nearest groups and marks agreeing complete results unverified', () => {
    const result = parseReplayMessageEvents(chat(), 1000000)
    const candidates = findReplayProtocolCandidates(1000000, MESSAGE_PROTOCOL_GROUPS)
    expect(candidates).toHaveLength(3)
    expect(result.events).toEqual(parseReplayMessageEvents(chat(), 98310).events)
    expect(result.compatibility.state).toBe('unverified')
    expect(result.compatibility.candidateBuilds.length).toBeGreaterThan(0)
    expect(result.compatibility.candidateBuilds.length).toBeLessThanOrEqual(3)
    expect(
      result.compatibility.candidateBuilds.every((build) =>
        candidates.some((group) => group.sourceBuild === build),
      ),
    ).toBe(true)
    expect(() => parseReplayMessageEvents(chat(), 1000000, { allowUnverified: false })).toThrow(
      UnsupportedReplayBuildError,
    )
  })

  it('keeps the successful complete candidate when another fails on a later event', () => {
    const reconnect = header(new Bits(), modern, 4, 32).bits(1, 2).align().data()
    const bytes = concat(chat(), reconnect)
    const result = parseReplayMessageEvents(bytes, 1000000)
    expect(result.events).toEqual(parseReplayMessageEvents(bytes, 98310).events)
    expect(result.compatibility).toEqual({
      state: 'unverified',
      protocolBuild: findReplayMessageProtocol(98310)!.sourceBuild,
      candidateBuilds: [findReplayMessageProtocol(98310)!.sourceBuild],
    })
    expect(result.elapsedGameLoops).toBe(48)
  })

  it('rejects unknown-build empty, incomplete or ambiguous evidence', () => {
    expect(() => parseReplayMessageEvents(new Uint8Array(), 1000000)).toThrow(
      'Empty message stream',
    )
    expect(() => parseReplayMessageEvents(Uint8Array.of(0), 1000000)).toThrow(
      'No candidate message protocol',
    )
    expect(() => parseReplayMessageEvents(concat(chat(), Uint8Array.of(0)), 1000000)).toThrow(
      UnsupportedReplayProtocolError,
    )
    // Two- and three-bit recipient schemas both consume this whole ping but disagree on its body.
    const old = findReplayMessageProtocol(16561)!.schema
    const ping = header(new Bits(), old, 1)
      .bits(1, 2)
      .bits(0xffffffff, 32)
      .bits(2147483648, 32)
      .align()
      .data()
    expect(() => parseReplayMessageEvents(ping, 16562)).toThrow(
      'Ambiguous candidate message protocols',
    )
  })

  it('counts non-chat events toward the event ceiling and bounds input and options', () => {
    const ping = header(new Bits(), modern, 3).align().data()
    const bytes = concat(chat(), ping)
    expect(() => parseReplayMessageEvents(bytes, 98310, { maxEvents: 1 })).toThrow('event limit')
    expect(parseReplayMessageEvents(bytes, 98310, { maxEvents: 2 }).processedEvents).toBe(2)
    for (const maxEvents of [0, -1, 100001, 1.5, NaN, Infinity]) {
      expect(() => parseReplayMessageEvents(bytes, 98310, { maxEvents })).toThrow(RangeError)
    }
    expect(() => parseReplayMessageEvents(new Uint8Array(4 * 1024 * 1024 + 1), 98310)).toThrow(
      'byte limit',
    )
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid baseBuild %s',
    (build) => {
      expect(() => parseReplayMessageEvents(new Uint8Array(), build)).toThrow(
        UnsupportedReplayBuildError,
      )
    },
  )
})
