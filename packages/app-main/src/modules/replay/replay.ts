import { randomUUID } from 'node:crypto'
import { readdir, rm, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { inspectReplayFile, looksLikeReplay, type ReplayInspectionResult } from '@scnexus/replay-parser'
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

  async scanDirectory(rootDir: string): Promise<ReplayRecord[]> {
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
    const fileStat = await stat(filePath)
    const inspection = await inspectReplayFile(filePath)

    return {
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
  }

  async importReplayArchive(archivePath: string, destinationDir: string): Promise<ReplayRecord[]> {
    const archiveFileName = basename(archivePath)
    const outputDir = join(destinationDir, archiveFileName.replace(/\.[^.]+$/, ''))

    await this.archiveReader.extract(archivePath, { outputDir })
    return this.scanDirectory(outputDir)
  }

  async deleteReplay(filePath: string): Promise<void> {
    await rm(filePath, { force: true, recursive: true })
  }
}

export const replayLibraryService = new ReplayLibraryService()
