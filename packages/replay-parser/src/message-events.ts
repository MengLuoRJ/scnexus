import type { ReplayProtocolStamp } from './components.js'
import { ProtocolDecoder, ReplayBitReader } from './protocol-decoder.js'
import type { ReplayProtocolValue } from './protocol-decoder.js'
import {
  REPLAY_PROTOCOL_ALGORITHM_VERSION,
  UnsupportedReplayBuildError,
  UnsupportedReplayProtocolError,
} from './protocol-schema.js'
import type { MessageProtocolSchema } from './protocol-schema.js'
import {
  MESSAGE_PROTOCOL_GROUPS,
  findReplayMessageProtocol,
  findReplayProtocolCandidates,
} from './protocols/game-registry.js'

export type ReplayMessageEvent = {
  eventId: number
  /** Exact official s2protocol message name, without synthetic suffixes. */
  eventType: string
  gameLoop: number
  /** Raw replay user id, or -1 for old protocols without a user-id header. */
  userId: number
  data: Record<string, ReplayProtocolValue>
}
export type ReplayMessageEvents = ReplayProtocolStamp & {
  compatibility: {
    state: 'verified' | 'unverified'
    protocolBuild: number
    candidateBuilds: number[]
  }
  processedEvents: number
  skippedEvents: number
  elapsedGameLoops: number
  events: ReplayMessageEvent[]
}
export type ReplayMessageParseOptions = {
  /** Lower the 100,000-event ceiling. All known message kinds count toward this limit. */
  maxEvents?: number
  /** Unknown builds may try at most three nearest distinct official protocol groups. */
  allowUnverified?: boolean
}

function record(value: ReplayProtocolValue): Record<string, ReplayProtocolValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected message event protocol struct')
  return value
}

function* decodeMessageStream(
  data: Uint8Array,
  baseBuild: number,
  protocolBuild: number,
  schema: MessageProtocolSchema,
  maxEvents: number,
  retain = true,
): Generator<ReplayMessageEvent, ReplayMessageEvents> {
  const reader = new ReplayBitReader(data)
  // One decoder bounds total nodes across the whole stream, not just each event.
  const decoder = new ProtocolDecoder(schema, reader)
  const events: ReplayMessageEvent[] = []
  let gameLoop = 0
  let processedEvents = 0
  while (reader.position < data.length * 8) {
    if (++processedEvents > maxEvents) throw new Error('Replay message event limit exceeded')
    const delta = Object.values(record(decoder.decode(schema.delta)))[0]
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta < 0 || delta > 0xffffffff)
      throw new Error('Invalid message game-loop delta')
    gameLoop += delta
    if (!Number.isSafeInteger(gameLoop)) throw new Error('Message game-loop overflow')
    const userId = schema.userId === undefined ? -1 : record(decoder.decode(schema.userId)).m_userId
    if (typeof userId !== 'number' || !Number.isInteger(userId))
      throw new Error('Invalid message user id')
    const eventId = decoder.decode(schema.eventId)
    if (typeof eventId !== 'number') throw new Error('Invalid message event id')
    const definition = schema.events[eventId]
    if (!definition) throw new Error(`Unknown message event id ${eventId}; boundary unavailable`)
    const body = record(decoder.decode(definition[0]))
    reader.alignedBytes(0)
    const event = {
      eventId,
      eventType: definition[1],
      gameLoop,
      userId,
      data: body,
    }
    if (retain) events.push(event)
    yield event
  }
  return {
    baseBuild,
    protocolVersion: `s2protocol-${protocolBuild}`,
    algorithmVersion: REPLAY_PROTOCOL_ALGORITHM_VERSION,
    compatibility: { state: 'verified', protocolBuild, candidateBuilds: [protocolBuild] },
    processedEvents,
    skippedEvents: 0,
    elapsedGameLoops: gameLoop,
    events,
  }
}

/** Decode decompressed replay.message.events with the pinned official s2protocol schemas.
 * Every known message body is retained, including chat m_string blobs and m_recipient.
 * Unknown ids and truncation abort: message events have no recoverable length prefix.
 */
export function parseReplayMessageEvents(
  data: Uint8Array,
  baseBuild: number,
  options: ReplayMessageParseOptions = {},
): ReplayMessageEvents {
  if (!Number.isSafeInteger(baseBuild) || baseBuild <= 0)
    throw new UnsupportedReplayBuildError(baseBuild)
  const maxEvents = options.maxEvents ?? 100_000
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 100_000)
    throw new RangeError('Invalid message maxEvents')
  if (data.length > 4 * 1024 * 1024) throw new Error('Replay message component byte limit exceeded')
  const known = findReplayMessageProtocol(baseBuild)
  if (known) {
    const iterator = decodeMessageStream(
      data,
      baseBuild,
      known.sourceBuild,
      known.schema,
      maxEvents,
    )
    let next = iterator.next()
    while (!next.done) next = iterator.next()
    return next.value
  }
  if (options.allowUnverified === false) throw new UnsupportedReplayBuildError(baseBuild)
  if (!data.length)
    throw new UnsupportedReplayProtocolError(
      'Empty message stream cannot establish candidate compatibility',
    )
  const attempts = findReplayProtocolCandidates(baseBuild, MESSAGE_PROTOCOL_GROUPS).map(
    (group) => ({
      group,
      iterator: decodeMessageStream(
        data,
        baseBuild,
        group.sourceBuild,
        group.schema,
        maxEvents,
        false,
      ),
      failed: false,
      result: null as ReplayMessageEvents | null,
    }),
  )
  // Compare complete evidence a single event at a time, not large serialized streams.
  const conflicts = new Set<string>()
  while (attempts.some((attempt) => !attempt.failed && !attempt.result)) {
    const round = attempts.map((attempt) => {
      if (attempt.failed || attempt.result) return null
      try {
        const next = attempt.iterator.next()
        if (next.done) {
          attempt.result = next.value
          return 'end'
        }
        return JSON.stringify(next.value, (_key, value: unknown) =>
          value && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
            : value,
        )
      } catch {
        attempt.failed = true
        return null
      }
    })
    for (let i = 0; i < attempts.length; i++) {
      for (let j = i + 1; j < attempts.length; j++) {
        if (attempts[i]!.failed || attempts[j]!.failed) continue
        const a = round[i] ?? (attempts[i]!.result ? 'end' : null)
        const b = round[j] ?? (attempts[j]!.result ? 'end' : null)
        if (a !== b) conflicts.add(`${i}:${j}`)
      }
    }
  }
  const successful = attempts
    .map((attempt, index) => ({ ...attempt, index }))
    .filter((attempt) => attempt.result && !attempt.failed)
  if (!successful.length)
    throw new UnsupportedReplayProtocolError(
      'No candidate message protocol decoded the complete stream',
    )
  for (const a of successful) {
    for (const b of successful) {
      if (a.index < b.index && conflicts.has(`${a.index}:${b.index}`))
        throw new UnsupportedReplayProtocolError(
          'Ambiguous candidate message protocols; decoded events disagree',
        )
    }
  }
  const selected = successful[0]!.group
  const iterator = decodeMessageStream(
    data,
    baseBuild,
    selected.sourceBuild,
    selected.schema,
    maxEvents,
  )
  let next = iterator.next()
  while (!next.done) next = iterator.next()
  const result = next.value
  result.compatibility = {
    state: 'unverified',
    protocolBuild: successful[0]!.group.sourceBuild,
    candidateBuilds: successful.map((attempt) => attempt.group.sourceBuild),
  }
  return result
}
