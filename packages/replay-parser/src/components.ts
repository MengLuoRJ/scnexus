import { ProtocolDecoder, ReplayBitReader } from './protocol-decoder.js'
import type { ReplayProtocolValue } from './protocol-decoder.js'
import {
  REPLAY_PROTOCOL_ALGORITHM_VERSION,
  replayProtocol,
  replayTrackerProtocol,
  REPLAY_TRACKER_PROTOCOL_VERSION,
  REPLAY_TRACKER_DECODER_STRATEGY,
} from './protocol-schema.js'
import { decodeVersionedPrefix } from './versioned.js'

export type ReplayProtocolStamp = {
  baseBuild: number
  protocolVersion: string
  algorithmVersion: string
}
export type ReplayInitData = ReplayProtocolStamp & { data: Record<string, ReplayProtocolValue> }
export type ReplayTrackerEvent = {
  eventId: number
  eventType: string
  gameLoop: number
  data: Record<string, ReplayProtocolValue>
}
export type ReplayTrackerEvents = ReplayProtocolStamp & {
  decoderStrategy: typeof REPLAY_TRACKER_DECODER_STRATEGY
  unknownEventIds: number[]
  skippedEvents: number
  warnings: string[]
  events: ReplayTrackerEvent[]
}
export type ReplayTrackerParseOptions = {
  /** Lower the built-in 100,000-event ceiling; excess events throw rather than truncate. */
  maxEvents?: number
}
export type ReplayAttribute = {
  namespace: number
  attributeId: number
  scope: number
  value: string
}
export type ReplayAttributes = {
  protocolVersion: 'attributes-v1'
  algorithmVersion: string
  source: number
  mapNamespace: number
  attributes: ReplayAttribute[]
}

function stamp(baseBuild: number): ReplayProtocolStamp {
  return {
    baseBuild,
    protocolVersion: `s2protocol-${baseBuild}`,
    algorithmVersion: REPLAY_PROTOCOL_ALGORITHM_VERSION,
  }
}
function bounded(data: Uint8Array, max: number): void {
  if (data.length > max) throw new Error('Replay component byte limit exceeded')
}
function record(value: ReplayProtocolValue): Record<string, ReplayProtocolValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected protocol struct')
  return value
}

/** Input is the decompressed replay.initData component, not an MPQ archive. */
export function parseReplayInitData(data: Uint8Array, baseBuild: number): ReplayInitData {
  const schema = replayProtocol(baseBuild)
  bounded(data, 4 * 1024 * 1024)
  const reader = new ReplayBitReader(data)
  const decoded = new ProtocolDecoder(schema, reader).decode(schema.initData)
  if (Math.ceil(reader.position / 8) !== data.length) throw new Error('Trailing initData bytes')
  return { ...stamp(baseBuild), data: record(decoded) }
}

/** Tracker streams are Versioned, not bit-packed; deltas and ids have no user-id prefix. */
export function parseReplayTrackerEvents(
  data: Uint8Array,
  baseBuild: number,
  options: ReplayTrackerParseOptions = {},
): ReplayTrackerEvents {
  const maxEvents = options.maxEvents ?? 100_000
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 100_000)
    throw new RangeError('Invalid tracker maxEvents')
  const schema = replayTrackerProtocol(baseBuild)
  bounded(data, 32 * 1024 * 1024)
  const events: ReplayTrackerEvent[] = []
  const unknownEventIds = new Set<number>()
  const warnings = new Set<string>()
  let skippedEvents = 0
  let processedEvents = 0
  let offset = 0
  let gameLoop = 0
  const read = () => {
    const next = decodeVersionedPrefix(data, offset, true)
    offset = next.nextOffset
    return next
  }
  while (offset < data.length) {
    if (++processedEvents > maxEvents) throw new Error('Replay tracker event limit exceeded')
    const decoder = new ProtocolDecoder(schema)
    const rawDelta = read()
    const delta = Object.values(
      record(decoder.decode(schema.delta, rawDelta.value, 0, rawDelta.wire)),
    )[0]
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta < 0 || delta > 0xffffffff)
      throw new Error('Invalid tracker game-loop delta')
    gameLoop += delta
    if (!Number.isSafeInteger(gameLoop)) throw new Error('Tracker game-loop overflow')
    const rawId = read()
    if (
      rawId.wire.type !== 9 ||
      typeof rawId.value !== 'bigint' ||
      rawId.value < 0n ||
      rawId.value > BigInt(Number.MAX_SAFE_INTEGER)
    )
      throw new Error('Invalid tracker event id')
    const eventId = Number(rawId.value)
    // Fully consume the self-describing payload before deciding whether it is understood.
    // Wire errors must escape: without a complete body there is no safe next-event boundary.
    const body = read()
    const definition = schema.events[eventId]
    if (!definition) {
      unknownEventIds.add(eventId)
      skippedEvents++
      warnings.add(`Unknown tracker event id ${eventId}; payload skipped`)
      continue
    }
    try {
      const decoded = record(decoder.decode(definition[0], body.value, 0, body.wire))
      events.push({ eventId, eventType: definition[1], gameLoop, data: decoded })
    } catch (error) {
      skippedEvents++
      warnings.add(
        `Tracker event ${eventId} schema mismatch: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return {
    ...stamp(baseBuild),
    protocolVersion: REPLAY_TRACKER_PROTOCOL_VERSION,
    decoderStrategy: REPLAY_TRACKER_DECODER_STRATEGY,
    unknownEventIds: [...unknownEventIds],
    skippedEvents,
    warnings: [...warnings],
    events,
  }
}

/** Fixed little-endian records; values are reversed FourCCs, not localized display labels. */
export function parseReplayAttributes(data: Uint8Array): ReplayAttributes {
  bounded(data, 4 * 1024 * 1024)
  if (data.length < 9) throw new Error('Truncated replay attributes header')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const count = view.getUint32(5, true)
  if (count > 100_000 || data.length !== 9 + count * 13)
    throw new Error('Invalid replay attributes record count')
  const attributes: ReplayAttribute[] = []
  for (let i = 0; i < count; i++) {
    const offset = 9 + i * 13
    const bytes = Array.from(data.subarray(offset + 9, offset + 13)).reverse()
    while (bytes[0] === 0) bytes.shift()
    while (bytes[bytes.length - 1] === 0) bytes.pop()
    attributes.push({
      namespace: view.getUint32(offset, true),
      attributeId: view.getUint32(offset + 4, true),
      scope: data[offset + 8]!,
      value: String.fromCharCode(...bytes),
    })
  }
  return {
    protocolVersion: 'attributes-v1',
    algorithmVersion: REPLAY_PROTOCOL_ALGORITHM_VERSION,
    source: data[0]!,
    mapNamespace: view.getUint32(1, true),
    attributes,
  }
}
