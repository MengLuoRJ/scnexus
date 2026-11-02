// Derived from Blizzard s2protocol 901804e41283269d43d7bfc3b8dc5be2a9dd350a.
// MIT; see LICENSE.s2protocol. Do not edit.
import type { GameProtocolSchema } from '../protocol-schema.js'
import game70154 from './game70154.js'
import game80669 from './game-group-80669.js'

export type GameProtocolGroup = {
  sourceBuild: number
  builds: readonly number[]
  schema: GameProtocolSchema
  fingerprint: string
}

export const GAME_PROTOCOL_GROUPS: readonly GameProtocolGroup[] = [
  {
    sourceBuild: 70154,
    builds: [
      70154, 71061, 71523, 71663, 72282, 73286, 73559, 73620, 74071, 74456, 74741, 75025, 75689,
      75800, 76052, 76114, 77379, 77535, 77661, 78285,
    ],
    schema: game70154,
    fingerprint: '7e1a63556d241312b6bca7da51633547744e031bedd6233bc273055a03ed6498',
  },
  {
    sourceBuild: 80669,
    builds: [
      80669, 80949, 81009, 82457, 82893, 83830, 84643, 86383, 87702, 88500, 89634, 89720, 90136,
      90779, 90870, 91115, 92028, 92174, 92440, 93272, 93333, 95248, 95299, 97364, 97425, 97563,
      98310,
    ],
    schema: game80669,
    fingerprint: '00a5c13f1da7ac91a5a4cf750caabc998d961981135509a601f7cd0693e0bc03',
  },
]

/** Exact source-verified membership only; unknown builds are not inferred. */
export function findReplayGameProtocol(baseBuild: number): GameProtocolGroup | undefined {
  return GAME_PROTOCOL_GROUPS.find((group) => group.builds.includes(baseBuild))
}
