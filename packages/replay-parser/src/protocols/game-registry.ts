// Blizzard s2protocol 3b40c5ef01834096b4305172ef5485ec00133dcc; MIT, see LICENSE.s2protocol.
import type {
  ProtocolSchema,
  GameProtocolSchema,
  MessageProtocolSchema,
  TrackerProtocolSchema,
} from '../protocol-schema.js'
import {
  OFFICIAL_TYPES,
  INIT_GROUP_DATA,
  GAME_GROUP_DATA,
  MESSAGE_GROUP_DATA,
  TRACKER_GROUP_DATA,
  HEADER_GROUP_DATA,
  DETAILS_GROUP_DATA,
} from './official-data.js'

export type ProtocolGroup<T> = {
  sourceBuild: number
  builds: readonly number[]
  schema: T
  fingerprint: string
}
export type GameProtocolGroup = ProtocolGroup<GameProtocolSchema>
function groups<T>(
  data: readonly { sourceBuild: number; builds: number[]; schema: unknown; fingerprint: string }[],
): ProtocolGroup<T>[] {
  return data.map((group) => ({
    ...group,
    schema: { ...(group.schema as object), types: OFFICIAL_TYPES } as T,
  }))
}
export const INIT_PROTOCOL_GROUPS = groups<ProtocolSchema>(INIT_GROUP_DATA)
export const GAME_PROTOCOL_GROUPS = groups<GameProtocolSchema>(GAME_GROUP_DATA)
export const MESSAGE_PROTOCOL_GROUPS = groups<MessageProtocolSchema>(MESSAGE_GROUP_DATA)
export const TRACKER_PROTOCOL_GROUPS = groups<TrackerProtocolSchema>(TRACKER_GROUP_DATA)
export const HEADER_PROTOCOL_GROUPS = groups<ProtocolSchema>(HEADER_GROUP_DATA)
export const DETAILS_PROTOCOL_GROUPS = groups<ProtocolSchema>(DETAILS_GROUP_DATA)
export function findReplayGameProtocol(baseBuild: number): GameProtocolGroup | undefined {
  return GAME_PROTOCOL_GROUPS.find((group) => group.builds.includes(baseBuild))
}
export function findReplayMessageProtocol(
  baseBuild: number,
): ProtocolGroup<MessageProtocolSchema> | undefined {
  return MESSAGE_PROTOCOL_GROUPS.find((group) => group.builds.includes(baseBuild))
}
export function findReplayProtocolCandidates<T>(
  baseBuild: number,
  candidates: readonly ProtocolGroup<T>[],
): ProtocolGroup<T>[] {
  return candidates
    .map((group) => {
      let distance = Infinity
      for (const build of group.builds) distance = Math.min(distance, Math.abs(build - baseBuild))
      return { group, distance }
    })
    .sort((a, b) => a.distance - b.distance || a.group.sourceBuild - b.group.sourceBuild)
    .slice(0, 3)
    .map(({ group }) => group)
}
