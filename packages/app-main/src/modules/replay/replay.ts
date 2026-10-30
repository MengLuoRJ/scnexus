import { randomUUID } from 'node:crypto'
import { lstat, readdir, unlink } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import {
  inspectReplayFile,
  looksLikeReplay,
  type ReplayInspectionResult,
} from '@scnexus/replay-parser'
import { replayDatabase } from './replay-db'
import { SevenZipWrapper } from '../../utils/7zip-wrapper'

export type ReplayRecord = {
  id: string
  path: string
  fileName: string
  extension: string
  sizeBytes: number
  mtimeMs: number
  status: ReplayInspectionResult['status']
  supportLevel: ReplayInspectionResult['supportLevel']
  mapName: string | null
  gameVersion: string | null
  baseBuild: number | null
  durationSeconds: number | null
  players: ReplayInspectionResult['summary']['players']
  warnings: string[]
}

export class ReplayLibraryService {
  private readonly archiveReader = new SevenZipWrapper()

  async ensureReady() {
    await replayDatabase.initialize()
  }

  async listStoredReplays(): Promise<ReplayRecord[]> {
    await this.ensureReady()
    return replayDatabase.listReplays()
  }

  async scanDirectory(rootDir: string): Promise<ReplayRecord[]> {
    await this.ensureReady()
    const entries = await readdir(rootDir, { withFileTypes: true })
    const results: ReplayRecord[] = []

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(rootDir, entry.name)
      if (entry.isDirectory()) {
        const nested = await this.scanDirectory(fullPath)
        results.push(...nested)
        continue
      }

      if (!entry.isFile() || !looksLikeReplay(fullPath)) continue
      results.push(await this.indexReplayFile(fullPath))
    }

    return results
  }

  async indexReplayFile(filePath: string): Promise<ReplayRecord> {
    await this.ensureReady()
    filePath = resolve(filePath)
    if (!looksLikeReplay(filePath)) throw new Error('Expected a .SC2Replay file')
    const fileStat = await lstat(filePath)
    if (!fileStat.isFile()) throw new Error('Replay must be a regular file')
    const inspection = await inspectReplayFile(filePath)
    const record: ReplayRecord = {
      id: randomUUID(),
      path: filePath,
      fileName: basename(filePath),
      extension: extname(filePath).toLowerCase(),
      sizeBytes: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      status: inspection.status,
      supportLevel: inspection.supportLevel,
      mapName: inspection.summary.mapName,
      gameVersion: inspection.summary.gameVersion,
      baseBuild: inspection.summary.baseBuild,
      durationSeconds: inspection.summary.durationSeconds,
      players: inspection.summary.players,
      warnings: inspection.warnings,
    }

    return replayDatabase.upsertReplay(record)
  }

  async importReplayArchive(archivePath: string, destinationDir: string): Promise<ReplayRecord[]> {
    await this.ensureReady()
    const archiveFileName = basename(archivePath)
    const outputDir = join(destinationDir, archiveFileName.replace(/\.[^.]+$/, ''))

    await this.archiveReader.extract(archivePath, { outputDir })
    return this.scanDirectory(outputDir)
  }

  async deleteReplay(filePath: string): Promise<void> {
    await this.ensureReady()
    filePath = resolve(filePath)
    if (!looksLikeReplay(filePath)) throw new Error('Expected a .SC2Replay file')
    const records = await replayDatabase.listReplays()
    if (!records.some((record) => record.path === filePath))
      throw new Error('Replay is not indexed')
    try {
      const fileStat = await lstat(filePath)
      if (!fileStat.isFile()) throw new Error('Replay must be a regular file')
      await unlink(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await replayDatabase.deleteReplayByPath(filePath)
  }
}

export const replayLibraryService = new ReplayLibraryService()
