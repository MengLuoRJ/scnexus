import build70154 from './protocols/build70154.js'
import build98310 from './protocols/build98310.js'

export type Bounds = [number, number]
export type ProtocolType =
  | ['_int' | '_blob' | '_bitarray', [Bounds]]
  | ['_bool', []]
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

export const REPLAY_PROTOCOL_ALGORITHM_VERSION = '1.0.0'
export const SUPPORTED_REPLAY_BASE_BUILDS = [70154, 98310] as const

export class UnsupportedReplayBuildError extends Error {
  readonly code = 'UNSUPPORTED_REPLAY_BUILD'
  constructor(readonly baseBuild: number) {
    super(`Unsupported replay base build: ${baseBuild}`)
    this.name = 'UnsupportedReplayBuildError'
  }
}

/** Exact registry only: game version/build is not interchangeable with header baseBuild. */
export function replayProtocol(baseBuild: number): ProtocolSchema {
  switch (baseBuild) {
    case 70154:
      return build70154
    case 98310:
      return build98310
    default:
      throw new UnsupportedReplayBuildError(baseBuild)
  }
}
