import { ProtocolDecoder, ReplayBitReader } from './protocol-decoder.js'
import type { ReplayProtocolValue } from './protocol-decoder.js'
import type { ReplayProtocolStamp } from './components.js'
import {
  REPLAY_PROTOCOL_ALGORITHM_VERSION,
  UnsupportedReplayBuildError,
  UnsupportedReplayProtocolError,
} from './protocol-schema.js'
import type { GameProtocolSchema } from './protocol-schema.js'
import { GAME_PROTOCOL_GROUPS, findReplayGameProtocol } from './protocols/game-registry.js'

export type ReplayGameEvent = {
  eventId: number
  eventType: string
  gameLoop: number
  /** Raw replay user id, not a tracker player id or lobby slot. */
  userId: number
  data: Record<string, ReplayProtocolValue>
}
export type ReplayGameEvents = ReplayProtocolStamp & {
  compatibility: {
    state: 'verified' | 'unverified'
    protocolBuild: number
    candidateBuilds: number[]
  }
  processedEvents: number
  skippedEvents: number
  events: ReplayGameEvent[]
}
export type ReplayGameParseOptions = {
  /** Lower the 100,000-event ceiling; includes known events not retained in the result. */
  maxEvents?: number
  /** Unknown builds may be tried against at most three protocol groups; never verified by guessing. */
  allowUnverified?: boolean
}

const RETAINED_EVENTS = new Set([
  'NNet.Game.SCmdEvent',
  'NNet.Game.SSelectionDeltaEvent',
  'NNet.Game.SControlGroupUpdateEvent',
])

function record(value: ReplayProtocolValue): Record<string, ReplayProtocolValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected game event protocol struct')
  return value
}

/** Decode decompressed replay.game.events, retaining raw command/selection/control-group evidence.
 * Other known bodies are decoded to advance safely. Unknown ids abort (no length prefix exists).
 * Ability link/index values are identifiers only: this API does not infer names or command intent.
 */
function* decodeGameStream(
  data: Uint8Array,
  baseBuild: number,
  protocolBuild: number,
  schema: GameProtocolSchema,
  maxEvents: number,
): Generator<ReplayGameEvent, ReplayGameEvents> {
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 100_000)
    throw new RangeError('Invalid game maxEvents')
  if (data.length > 32 * 1024 * 1024) throw new Error('Replay game component byte limit exceeded')
  const reader = new ReplayBitReader(data)
  // Share the node budget across the complete stream, including discarded known events.
  const decoder = new ProtocolDecoder(schema, reader)
  const events: ReplayGameEvent[] = []
  let processedEvents = 0
  let skippedEvents = 0
  let gameLoop = 0
  while (reader.position < data.length * 8) {
    if (++processedEvents > maxEvents) throw new Error('Replay game event limit exceeded')
    const delta = Object.values(record(decoder.decode(schema.delta)))[0]
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta < 0 || delta > 0xffffffff)
      throw new Error('Invalid game-loop delta')
    gameLoop += delta
    if (!Number.isSafeInteger(gameLoop)) throw new Error('Game-loop overflow')
    const userId = record(decoder.decode(schema.userId)).m_userId
    if (typeof userId !== 'number') throw new Error('Invalid game user id')
    const eventId = decoder.decode(schema.eventId)
    if (typeof eventId !== 'number') throw new Error('Invalid game event id')
    const definition = schema.events[eventId]
    if (!definition) throw new Error(`Unknown game event id ${eventId}; boundary unavailable`)
    const body = record(decoder.decode(definition[0]))
    reader.alignedBytes(0)
    const event = { eventId, eventType: definition[1], gameLoop, userId, data: body }
    yield event
    if (RETAINED_EVENTS.has(definition[1])) {
      events.push(event)
    } else {
      skippedEvents++
    }
  }
  return {
    baseBuild,
    protocolVersion: `s2protocol-${protocolBuild}`,
    compatibility: { state: 'verified', protocolBuild, candidateBuilds: [protocolBuild] },
    algorithmVersion: REPLAY_PROTOCOL_ALGORITHM_VERSION,
    processedEvents,
    skippedEvents,
    events,
  }
}

/** Official structure-equivalent builds share a schema. Trial results remain explicitly unverified. */
export function parseReplayGameEvents(
  data: Uint8Array,
  baseBuild: number,
  options: ReplayGameParseOptions = {},
): ReplayGameEvents {
  if (!Number.isSafeInteger(baseBuild) || baseBuild <= 0)
    throw new UnsupportedReplayBuildError(baseBuild)
  const maxEvents = options.maxEvents ?? 100_000
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 100_000)
    throw new RangeError('Invalid game maxEvents')
  if (data.length > 32 * 1024 * 1024) throw new Error('Replay game component byte limit exceeded')
  const known = findReplayGameProtocol(baseBuild)
  if (known) {
    const iterator = decodeGameStream(data, baseBuild, known.sourceBuild, known.schema, maxEvents)
    let next = iterator.next()
    while (!next.done) next = iterator.next()
    return next.value
  }
  if (options.allowUnverified === false) throw new UnsupportedReplayBuildError(baseBuild)
  if (!data.length)
    throw new UnsupportedReplayProtocolError(
      'Empty game stream cannot establish candidate compatibility',
    )
  const groups = [...GAME_PROTOCOL_GROUPS]
    .sort((a, b) => Math.abs(a.sourceBuild - baseBuild) - Math.abs(b.sourceBuild - baseBuild))
    .slice(0, 3)
  const attempts = groups.map((group) => ({
    group,
    iterator: decodeGameStream(data, baseBuild, group.sourceBuild, group.schema, maxEvents),
    failed: false,
    result: null as ReplayGameEvents | null,
  }))
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
      'No candidate game protocol decoded the complete stream',
    )
  for (const a of successful) {
    for (const b of successful) {
      if (a.index < b.index && conflicts.has(`${a.index}:${b.index}`))
        throw new UnsupportedReplayProtocolError(
          'Ambiguous candidate game protocols; decoded events disagree',
        )
    }
  }
  const result = successful[0]!.result!
  result.compatibility = {
    state: 'unverified',
    protocolBuild: successful[0]!.group.sourceBuild,
    candidateBuilds: successful.map((attempt) => attempt.group.sourceBuild),
  }
  return result
}
