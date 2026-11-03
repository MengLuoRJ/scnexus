import {
  INIT_PROTOCOL_GROUPS,
  GAME_PROTOCOL_GROUPS,
  TRACKER_PROTOCOL_GROUPS,
  findReplayGameProtocol,
  findReplayMessageProtocol,
} from './protocols/game-registry.js'
import trackerVersionedV1 from './protocols/tracker-versioned-v1.js'

export type Bounds = [number, number]
export type ProtocolType =
  | ['_int' | '_blob' | '_bitarray', [Bounds]]
  | ['_bool' | '_null' | '_fourcc', []]
  | ['_optional', [number]]
  | ['_array', [Bounds, number]]
  | ['_struct', [[string, number, number][]]]
  | ['_choice', [Bounds, Record<number, [string, number]>]]

export type ProtocolSchema = {
  initData: number
  delta: number
  eventId: number
  events: Record<number, [number, string]>
  types: Record<number, ProtocolType>
}

export type TrackerProtocolSchema = Omit<ProtocolSchema, 'initData'>
export type GameProtocolSchema = TrackerProtocolSchema & { userId?: number }
export type MessageProtocolSchema = GameProtocolSchema
export const SUPPORTED_REPLAY_GAME_BASE_BUILDS = GAME_PROTOCOL_GROUPS.flatMap((group) => [
  ...group.builds,
]).sort((a, b) => a - b)
export const SUPPORTED_REPLAY_BASE_BUILDS = INIT_PROTOCOL_GROUPS.flatMap((group) => [
  ...group.builds,
]).sort((a, b) => a - b)
export const REPLAY_PROTOCOL_ALGORITHM_VERSION = '2.0.0'
export function replayGameProtocol(baseBuild: number): GameProtocolSchema {
  const group = findReplayGameProtocol(baseBuild)
  if (!group) throw new UnsupportedReplayBuildError(baseBuild)
  return group.schema
}
export function replayMessageProtocol(baseBuild: number): MessageProtocolSchema {
  const group = findReplayMessageProtocol(baseBuild)
  if (!group) throw new UnsupportedReplayBuildError(baseBuild)
  return group.schema
}
export function replayInitDataProtocolBuild(baseBuild: number): number {
  const group = INIT_PROTOCOL_GROUPS.find((group) => group.builds.includes(baseBuild))
  if (!group) throw new UnsupportedReplayBuildError(baseBuild)
  return group.sourceBuild
}
export const REPLAY_TRACKER_PROTOCOL_VERSION = 'tracker-versioned-v1' as const
export const REPLAY_TRACKER_DECODER_STRATEGY = 'self-describing-versioned' as const

export class UnsupportedReplayProtocolError extends Error {
  readonly code = 'UNSUPPORTED_REPLAY_PROTOCOL'
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedReplayProtocolError'
  }
}

/** Capability dispatch: positive source builds use stable self-describing tracker tags only. */
export function replayTrackerProtocol(baseBuild: number): TrackerProtocolSchema {
  if (!Number.isSafeInteger(baseBuild) || baseBuild <= 0)
    throw new UnsupportedReplayBuildError(baseBuild)
  return (
    TRACKER_PROTOCOL_GROUPS.find((group) => group.builds.includes(baseBuild))?.schema ??
    trackerVersionedV1
  )
}

export class UnsupportedReplayBuildError extends Error {
  readonly code = 'UNSUPPORTED_REPLAY_BUILD'
  constructor(readonly baseBuild: number) {
    super(`Unsupported replay base build: ${baseBuild}`)
    this.name = 'UnsupportedReplayBuildError'
  }
}

/** Exact official membership only; unknown-build trials belong to the component parser. */
export function replayProtocol(baseBuild: number): ProtocolSchema {
  const group = INIT_PROTOCOL_GROUPS.find((group) => group.builds.includes(baseBuild))
  if (!group) throw new UnsupportedReplayBuildError(baseBuild)
  return group.schema
}
