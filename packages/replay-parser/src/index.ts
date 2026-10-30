import { REPLAY_COMPONENTS, REPLAY_FILE_EXTENSIONS } from './registry.js'

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

export async function inspectReplayFile(path: string): Promise<ReplayInspectionResult> {
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

  result.warnings.push(
    'File extension matches a replay candidate; archive validation and protocol decoding are not implemented.',
  )
  return result
}
