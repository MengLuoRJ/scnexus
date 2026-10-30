import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, rm, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { looksLikeReplay } from '@scnexus/replay-parser'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
export type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { replayDatabase } from './replay-db'
import { inspectLocalReplay } from './replay-inspection'
import { SevenZipWrapper } from '../../utils/7zip-wrapper'

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
    const inspection = await inspectLocalReplay(filePath)
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
    const listing = await this.archiveReader.list(archivePath)
    const paths = new Set<string>()
    let totalBytes = 0
    const entries = listing.entries.filter((entry) => {
      const parts = entry.path.split(/[\\/]/)
      if (
        parts.some(
          (part) =>
            !part ||
            part === '.' ||
            part === '..' ||
            /[:<>"|?*]/.test(part) ||
            [...part].some((char) => char.charCodeAt(0) < 32) ||
            /[. ]$/.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        )
      ) {
        throw new Error('Archive contains an unsafe path')
      }
      if (
        Object.keys(entry.properties).some((key) => /symbolic link|hard link|reparse/i.test(key)) ||
        /l/i.test(entry.attributes ?? '')
      ) {
        throw new Error('Archive links are not supported')
      }
      if (entry.isDirectory || !looksLikeReplay(entry.path)) return false
      const key = parts.join('\\').toLowerCase()
      if (paths.has(key)) throw new Error('Archive contains duplicate replay paths')
      paths.add(key)
      if (entry.size === undefined || entry.size < 0 || entry.size > 128 * 1024 * 1024)
        throw new Error('Replay archive entry exceeds size limit')
      totalBytes += entry.size
      return true
    })
    if (entries.length === 0) throw new Error('Archive contains no .SC2Replay files')
    if (entries.length > 2000 || totalBytes > 1024 * 1024 * 1024)
      throw new Error('Replay archive exceeds import limits')
    const stem =
      basename(archivePath, extname(archivePath))
        .replace(/[^\p{L}\p{N}_-]/gu, '_')
        .slice(0, 60) || 'replays'
    const outputDir = await mkdtemp(join(resolve(destinationDir), `${stem}-`))
    try {
      for (const entry of entries) {
        const target = join(outputDir, ...entry.path.split(/[\\/]/))
        const data = await this.archiveReader.readFile(archivePath, entry.path, {
          maxBytes: 128 * 1024 * 1024,
        })
        if (data.length !== entry.size)
          throw new Error('Replay archive entry size changed during import')
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, data, { flag: 'wx' })
      }
    } catch (error) {
      await rm(outputDir, { recursive: true, force: true })
      throw error
    }
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
