import {
  decodeVersionedPrefix,
  versionedNumber,
  versionedStruct,
  versionedText,
} from './versioned.js'
import { ProtocolDecoder } from './protocol-decoder.js'
import {
  HEADER_PROTOCOL_GROUPS,
  DETAILS_PROTOCOL_GROUPS,
  findReplayProtocolCandidates,
} from './protocols/game-registry.js'
import type { ProtocolGroup } from './protocols/game-registry.js'
import type { ProtocolSchema } from './protocol-schema.js'
import type { ReplayPlayerSummary } from './index.js'

function metadataValue(
  data: Uint8Array,
  groups: readonly ProtocolGroup<ProtocolSchema>[],
  sourceBuild?: number | ((value: import('./versioned.js').VersionedValue) => number | null),
) {
  if (data.length > 4 * 1024 * 1024) throw new Error('Replay metadata byte limit exceeded')
  const decoded = decodeVersionedPrefix(data, 0, true)
  if (decoded.nextOffset !== data.length) throw new Error('Trailing replay metadata bytes')
  const baseBuild = typeof sourceBuild === 'function' ? sourceBuild(decoded.value) : sourceBuild
  const known = groups.find((group) => group.builds.includes(baseBuild ?? -1))
  const candidates = known ? [known] : findReplayProtocolCandidates(baseBuild ?? 98310, groups)
  let valid = false
  for (const group of candidates) {
    try {
      new ProtocolDecoder(group.schema).decode(
        group.schema.initData,
        decoded.value,
        0,
        decoded.wire,
      )
      valid = true
      break
    } catch {
      /* Older metadata has different field types. */
    }
  }
  if (!valid) throw new Error('Invalid replay metadata schema')
  return decoded.value
}

export type ReplayHeader = {
  gameVersion: string
  baseBuild: number
  elapsedGameLoops: number
  /** Game-loop time at 16 loops/s, not wall-clock duration at Faster speed. */
  durationSeconds: number
}

export function parseReplayHeader(data: Uint8Array): ReplayHeader {
  const header = versionedStruct(
    metadataValue(data, HEADER_PROTOCOL_GROUPS, (value) => {
      const header = versionedStruct(value)
      const version = header.get(1)
      return version instanceof Map ? versionedNumber(version.get(5)) : null
    }),
  )
  if (versionedText(header.get(0)) !== 'StarCraft II replay\x1b11')
    throw new Error('Invalid StarCraft II replay signature')
  const version = versionedStruct(header.get(1))
  const parts = [1, 2, 3, 4].map((tag) => versionedNumber(version.get(tag)))
  const baseBuild = versionedNumber(version.get(5))
  const loops = versionedNumber(header.get(3))
  if (parts.some((part) => part === null) || !baseBuild || loops === null) {
    throw new Error('Replay header is missing version or game-loop fields')
  }
  return {
    gameVersion: parts.join('.'),
    baseBuild,
    elapsedGameLoops: loops,
    durationSeconds: loops / 16,
  }
}

export function parseReplayDetails(
  data: Uint8Array,
  baseBuild?: number,
): {
  mapName: string
  playedAt: string | null
  players: ReplayPlayerSummary[]
} {
  const details = versionedStruct(metadataValue(data, DETAILS_PROTOCOL_GROUPS, baseBuild))
  const mapName = versionedText(details.get(1))
  const list = details.get(0)
  if (!mapName || !Array.isArray(list) || list.length > 64)
    throw new Error('Invalid replay.details metadata')
  const players: ReplayPlayerSummary[] = []
  for (const [index, value] of list.entries()) {
    const player = versionedStruct(value)
    const observer = versionedNumber(player.get(7))
    if (observer !== null && observer !== 0) continue
    const team = versionedNumber(player.get(5))
    const result = versionedNumber(player.get(8))
    const toon = player.get(1)
    let profileHandle: string | null = null
    if (toon instanceof Map) {
      const region = versionedNumber(toon.get(0))
      const realm = versionedNumber(toon.get(2))
      const id = toon.get(4)
      const program = toon.get(1)
      const programName =
        program instanceof Uint8Array
          ? new TextDecoder().decode(program).split(String.fromCharCode(0)).join('')
          : null
      if (
        programName === 'S2' &&
        region !== null &&
        region > 0 &&
        realm !== null &&
        realm > 0 &&
        typeof id === 'bigint' &&
        id > 0n
      ) {
        profileHandle = `${region}-S2-${realm}-${id}`
      }
    }
    players.push({
      profileHandle,
      slot: index + 1,
      name: versionedText(player.get(0)),
      race: versionedText(player.get(2)),
      team: team === null ? null : team + 1,
      result: result === 1 ? 'win' : result === 2 ? 'loss' : null,
    })
  }
  const ticks = details.get(5)
  let playedAt: string | null = null
  if (typeof ticks === 'bigint' && ticks > 116444736000000000n) {
    const milliseconds = (ticks - 116444736000000000n) / 10000n
    if (milliseconds <= 8640000000000000n) playedAt = new Date(Number(milliseconds)).toISOString()
  }
  return { mapName, playedAt, players }
}
