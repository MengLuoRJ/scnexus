import { REPLAY_COMPONENTS, REPLAY_FILE_EXTENSIONS, type ReplayComponentName } from './registry.js'
import { parseReplayHeader, parseReplayDetails } from './metadata.js'
export { decodeVersioned } from './versioned.js'
export {
  parseReplayAttributes,
  parseReplayInitData,
  parseReplayTrackerEvents,
} from './components.js'
export type {
  ReplayAttributes,
  ReplayAttribute,
  ReplayInitData,
  ReplayTrackerEvent,
  ReplayTrackerEvents,
  ReplayProtocolStamp,
} from './components.js'
export type { ReplayBlob, ReplayProtocolValue } from './protocol-decoder.js'
export {
  REPLAY_PROTOCOL_ALGORITHM_VERSION,
  SUPPORTED_REPLAY_BASE_BUILDS,
  UnsupportedReplayBuildError,
} from './protocol-schema.js'
export { parseReplayHeader, parseReplayDetails } from './metadata.js'
export type { ReplayHeader } from './metadata.js'

export type { ReplayComponent, ReplayComponentName } from './registry.js'
export { REPLAY_COMPONENTS, REPLAY_FILE_EXTENSIONS } from './registry.js'

export type ReplayFileStatus = 'supported' | 'partial' | 'unsupported' | 'corrupt'

export type ReplaySupportLevel = 'full' | 'metadata-only' | 'unsupported'

export type ReplayPlayerSummary = {
  slot: number
  name: string | null
  race: string | null
  team: number | null
  result: 'win' | 'loss' | 'draw' | null
}

export type ReplaySummary = {
  fileName: string
  mapName: string | null
  playedAt: string | null
  gameVersion: string | null
  baseBuild: number | null
  durationSeconds: number | null
  players: ReplayPlayerSummary[]
}

export type ReplayComponentInspection = {
  name: string
  found: boolean
  required: boolean
}

export type ReplayInspectionResult = {
  status: ReplayFileStatus
  detected: boolean
  supportLevel: ReplaySupportLevel
  fileName: string
  summary: ReplaySummary
  components: ReplayComponentInspection[]
  warnings: string[]
}

export function looksLikeReplay(path: string): boolean {
  const normalized = path.toLowerCase()
  return REPLAY_FILE_EXTENSIONS.some((suffix) => normalized.endsWith(suffix))
}

export type ReplayInspectionInput = {
  header?: Uint8Array
  components?: Partial<Record<ReplayComponentName, Uint8Array>>
  availableComponents?: ReplayComponentName[]
}

/** Archive I/O belongs to the host; only supplied component bytes are decoded here. */
export async function inspectReplayFile(
  path: string,
  input?: ReplayInspectionInput,
): Promise<ReplayInspectionResult> {
  const fileName = path.split(/[\\/]/).pop() ?? path
  const detected = looksLikeReplay(path)
  const result: ReplayInspectionResult = {
    status: 'unsupported',
    detected,
    supportLevel: 'unsupported',
    fileName,
    summary: {
      fileName,
      mapName: null,
      playedAt: null,
      gameVersion: null,
      baseBuild: null,
      durationSeconds: null,
      players: [],
    },
    components: REPLAY_COMPONENTS.map((component) => ({
      name: component.name,
      found: false,
      required: component.required,
    })),
    warnings: [],
  }

  if (!detected) {
    result.warnings.push('Path does not look like a StarCraft II replay file.')
    return result
  }

  if (!input) {
    result.warnings.push(
      'File extension matches a replay candidate; no archive components were supplied.',
    )
    return result
  }

  result.components = REPLAY_COMPONENTS.map((component) => ({
    name: component.name,
    required: component.required,
    found:
      input.availableComponents?.includes(component.name) === true ||
      input.components?.[component.name] !== undefined,
  }))
  let decoded = false
  let invalid = false
  if (input.header) {
    try {
      const header = parseReplayHeader(input.header)
      result.summary.gameVersion = header.gameVersion
      result.summary.baseBuild = header.baseBuild
      result.summary.durationSeconds = header.durationSeconds
      decoded = true
    } catch (error) {
      invalid = true
      result.warnings.push(
        `replay.header: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  const details = input.components?.['replay.details']
  if (details) {
    try {
      const metadata = parseReplayDetails(details)
      result.summary.mapName = metadata.mapName
      result.summary.playedAt = metadata.playedAt
      result.summary.players = metadata.players
      decoded = true
    } catch (error) {
      invalid = true
      result.warnings.push(
        `replay.details: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  result.status = invalid ? 'corrupt' : decoded ? 'partial' : 'unsupported'
  result.supportLevel = decoded ? 'metadata-only' : 'unsupported'
  if (result.summary.durationSeconds !== null)
    result.warnings.push(
      'Duration uses 16 game loops/s (game time), not Faster-speed wall-clock time.',
    )
  result.warnings.push(
    'Only self-describing header/details metadata is decoded; build-specific initData and event analysis are not supported.',
  )
  return result
}
