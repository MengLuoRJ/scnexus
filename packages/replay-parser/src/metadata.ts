import { decodeVersioned, versionedNumber, versionedStruct, versionedText } from './versioned.js'
import type { ReplayPlayerSummary } from './index.js'

export type ReplayHeader = {
  gameVersion: string
  baseBuild: number
  elapsedGameLoops: number
  /** Game-loop time at 16 loops/s, not wall-clock duration at Faster speed. */
  durationSeconds: number
}

export function parseReplayHeader(data: Uint8Array): ReplayHeader {
  const header = versionedStruct(decodeVersioned(data))
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

export function parseReplayDetails(data: Uint8Array): {
  mapName: string
  playedAt: string | null
  players: ReplayPlayerSummary[]
} {
  const details = versionedStruct(decodeVersioned(data))
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
    players.push({
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
