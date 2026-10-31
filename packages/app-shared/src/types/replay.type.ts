import type { IpcResult } from '../errors/app.error.js'

export type ReplayPlayer = {
  slot: number
  name: string | null
  race: string | null
  team: number | null
  result: 'win' | 'loss' | 'draw' | null
}

export type ReplayRecord = {
  id: string
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

export type ReplayAnalysis = {
  replayId: string
  contentHash: string
  parserVersion: string
  baseBuild: number | null
  status: 'completed' | 'partial' | 'unsupported' | 'corrupt'
  components: {
    initData: ReplayJson | null
    attributes: ReplayJson | null
    tracker: ReplayJson | null
  }
  warnings: string[]
  analyzedAt: string
}

export interface ReplayApi {
  analyze(replayId: string): Promise<IpcResult<ReplayAnalysis>>
  getAnalysis(replayId: string): Promise<IpcResult<ReplayAnalysis | null>>
  discoverDirectories(): Promise<IpcResult<ReplayDirectory[]>>
  listDuplicates(): Promise<IpcResult<ReplayDuplicateGroup[]>>
  chooseExportPath(): Promise<IpcResult<string | null>>
  exportArchive(
    replayIds: string[],
    destination: string,
  ): Promise<IpcResult<{ path: string; count: number }>>
  list(): Promise<IpcResult<ReplayRecord[]>>
  scanDirectory(rootDir: string): Promise<IpcResult<ReplayRecord[]>>
  indexFile(filePath: string): Promise<IpcResult<ReplayRecord>>
  importArchive(archivePath: string, destinationDir: string): Promise<IpcResult<ReplayRecord[]>>
  delete(filePath: string): Promise<IpcResult<void>>
}
