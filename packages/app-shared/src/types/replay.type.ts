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
  status: 'supported' | 'partial' | 'unsupported' | 'corrupt'
  supportLevel: 'full' | 'metadata-only' | 'unsupported'
  mapName: string | null
  gameVersion: string | null
  baseBuild: number | null
  durationSeconds: number | null
  players: ReplayPlayer[]
  warnings: string[]
}

export interface ReplayApi {
  list(): Promise<IpcResult<ReplayRecord[]>>
  scanDirectory(rootDir: string): Promise<IpcResult<ReplayRecord[]>>
  indexFile(filePath: string): Promise<IpcResult<ReplayRecord>>
  importArchive(archivePath: string, destinationDir: string): Promise<IpcResult<ReplayRecord[]>>
  delete(filePath: string): Promise<IpcResult<void>>
}
