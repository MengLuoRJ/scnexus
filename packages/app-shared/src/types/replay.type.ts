import type { IpcResult } from '../errors/app.error.js'

export type ReplayCategory = 'Multiplayer' | 'Campaign' | 'Challenge'
export type ReplayScope = { profileHandle: string; category: ReplayCategory }
export type StarCraftProfile = {
  accountId: string
  handle: string
  path: string
  replayPath: string
}

export type ReplayPlayer = {
  slot: number
  profileHandle?: string | null
  name: string | null
  race: string | null
  team: number | null
  result: 'win' | 'loss' | 'draw' | null
}

export type ReplayRecord = {
  id: string
  profileHandle: string | null
  category: ReplayCategory | null
  path: string
  fileName: string
  extension: string
  sizeBytes: number
  mtimeMs: number
  /** SHA-256 of file bytes; null for records not reindexed since schema migration. */
  contentHash: string | null
  status: 'supported' | 'partial' | 'unsupported' | 'corrupt'
  supportLevel: 'full' | 'metadata-only' | 'unsupported'
  mapName: string | null
  /** UTC ISO timestamp from replay.details m_timeUTC, not file modification time. */
  playedAt: string | null
  gameVersion: string | null
  baseBuild: number | null
  durationSeconds: number | null
  players: ReplayPlayer[]
  warnings: string[]
}

export type ReplayDirectory = {
  path: string
  account: string
  profile: string
}

export type ReplayDuplicateGroup = {
  contentHash: string
  replays: ReplayRecord[]
}

export type ReplayJson =
  | null
  | boolean
  | number
  | string
  | ReplayJson[]
  | { [key: string]: ReplayJson }

export type ReplayComponentCapability = {
  state: 'available' | 'partial' | 'missing' | 'unsupported' | 'corrupt'
  decoder: string | null
  sourceBuild: number | null
  compatibility?: {
    state: 'verified' | 'unverified'
    protocolBuild: number
    candidateBuilds: number[]
  }
}
export type ReplayAnalysis = {
  capabilities?: {
    initData: ReplayComponentCapability
    attributes: ReplayComponentCapability
    tracker: ReplayComponentCapability
    game?: ReplayComponentCapability
  }
  commands?: {
    gameLoop: number
    userId: number
    abilityLink: number | null
    abilityIndex: number | null
    flags: number
  }[]
  insights?: import('./replay-insights.type.js').ReplayInsights
  replayId: string
  contentHash: string
  parserVersion: string
  baseBuild: number | null
  status: 'completed' | 'partial' | 'unsupported' | 'corrupt'
  components: {
    initData: ReplayJson | null
    attributes: ReplayJson | null
    tracker: ReplayJson | null
    game?: ReplayJson | null
  }
  warnings: string[]
  analyzedAt: string
}

export interface ReplayApi {
  watch(scope: ReplayScope, replayId: string): Promise<IpcResult<void>>
  profiles(): Promise<IpcResult<StarCraftProfile[]>>
  analyze(scope: ReplayScope, replayId: string): Promise<IpcResult<ReplayAnalysis>>
  getAnalysis(scope: ReplayScope, replayId: string): Promise<IpcResult<ReplayAnalysis | null>>
  listDuplicates(scope: ReplayScope): Promise<IpcResult<ReplayDuplicateGroup[]>>
  chooseExportPath(): Promise<IpcResult<string | null>>
  exportArchive(
    scope: ReplayScope,
    replayIds: string[],
    destination: string,
  ): Promise<IpcResult<{ path: string; count: number }>>
  list(scope: ReplayScope): Promise<IpcResult<ReplayRecord[]>>
  scan(scope: ReplayScope): Promise<IpcResult<ReplayRecord[]>>
  importFile(scope: ReplayScope, filePath: string): Promise<IpcResult<ReplayRecord>>
  importArchive(scope: ReplayScope, archivePath: string): Promise<IpcResult<ReplayRecord[]>>
  delete(scope: ReplayScope, replayId: string): Promise<IpcResult<void>>
}
