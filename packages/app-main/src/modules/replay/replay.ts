import { randomUUID } from 'node:crypto'
import {
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { looksLikeReplay } from '@scnexus/replay-parser'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
export type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { replayDatabase } from './replay-db'
import { inspectLocalReplay } from './replay-inspection'
import { hashReplayFile } from './replay-files'
import { REPLAY_ANALYSIS_VERSION } from './replay-analysis'
import { runReplayAnalysis } from './replay-analysis-runner'
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

  private readonly analyses = new Map<
    string,
    Promise<import('@scnexus/app-shared/types/replay.type').ReplayAnalysis>
  >()

  async getAnalysis(replayId: string) {
    await this.ensureReady()
    const result = await replayDatabase.getAnalysis(replayId)
    if (!result || result.parserVersion !== REPLAY_ANALYSIS_VERSION) return null
    const record = (await this.listStoredReplays()).find((item) => item.id === replayId)
    if (!record || (await hashReplayFile(record.path)) !== result.contentHash) return null
    return result
  }

  async analyzeReplay(replayId: string) {
    const current = this.analyses.get(replayId)
    if (current) return current
    if (this.analyses.size >= 2) throw new Error('At most two replay analyses can run concurrently')
    const job = this.performAnalysis(replayId)
    this.analyses.set(replayId, job)
    try {
      return await job
    } finally {
      this.analyses.delete(replayId)
    }
  }

  private async performAnalysis(replayId: string) {
    const record = (await this.listStoredReplays()).find((item) => item.id === replayId)
    if (!record) throw new Error('Replay is not indexed')
    if (!record.contentHash || (await hashReplayFile(record.path)) !== record.contentHash)
      throw new Error('Replay changed; reindex before analysis')
    const result = await runReplayAnalysis(record)
    if ((await hashReplayFile(record.path)) !== record.contentHash)
      throw new Error('Replay changed during analysis')
    await replayDatabase.saveAnalysis(result)
    return result
  }

  async listDuplicates() {
    const groups = new Map<string, ReplayRecord[]>()
    for (const record of await this.listStoredReplays()) {
      if (!record.contentHash) continue
      const group = groups.get(record.contentHash) ?? []
      group.push(record)
      groups.set(record.contentHash, group)
    }
    return [...groups]
      .filter(([, replays]) => replays.length > 1)
      .map(([contentHash, replays]) => ({ contentHash, replays }))
  }

  async exportReplayArchive(
    replayIds: string[],
    destination: string,
  ): Promise<{ path: string; count: number }> {
    if (
      !replayIds.length ||
      replayIds.length > 2000 ||
      new Set(replayIds).size !== replayIds.length
    )
      throw new Error('Select between 1 and 2000 distinct replays')
    if (extname(destination).toLowerCase() !== '.zip')
      throw new Error('Replay export requires a .zip destination')
    const stored = new Map((await this.listStoredReplays()).map((record) => [record.id, record]))
    const records = replayIds.map((id) => {
      const record = stored.get(id)
      if (!record) throw new Error('Replay is not indexed')
      return record
    })
    if (records.reduce((sum, record) => sum + record.sizeBytes, 0) > 1024 * 1024 * 1024)
      throw new Error('Replay export exceeds 1 GiB limit')
    const output = resolve(destination)
    const staging = await mkdtemp(join(dirname(output), '.scnexus-replay-export-'))
    try {
      const files = join(staging, 'files')
      await mkdir(files)
      const names: string[] = []
      for (const [index, record] of records.entries()) {
        const info = await lstat(record.path)
        if (!info.isFile() || info.size > 128 * 1024 * 1024)
          throw new Error('Export source must be a regular replay under 128 MiB')
        const name = `${String(index + 1).padStart(4, '0')}-${record.fileName.replace(/[^\p{L}\p{N}_.-]/gu, '_').slice(-120)}`
        names.push(name)
        const target = join(files, name)
        await copyFile(record.path, target)
        const hash = await hashReplayFile(target)
        if (!record.contentHash || hash !== record.contentHash)
          throw new Error('Replay changed or lacks a content hash; reindex before export')
      }
      const archive = join(staging, 'replays.zip')
      await this.archiveReader.add(archive, names, {
        archiveType: 'zip',
        cwd: files,
        recursive: false,
      })
      // Same-volume hard link publishes a complete archive without replacing existing files.
      await link(archive, output)
      return { path: output, count: records.length }
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
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
    const contentHash = await hashReplayFile(filePath)
    const inspection = await inspectLocalReplay(filePath)
    const after = await lstat(filePath)
    if (
      fileStat.size !== after.size ||
      fileStat.mtimeMs !== after.mtimeMs ||
      fileStat.ctimeMs !== after.ctimeMs ||
      fileStat.ino !== after.ino
    ) {
      throw new Error('Replay changed during indexing; retry')
    }
    const record: ReplayRecord = {
      id: randomUUID(),
      path: filePath,
      fileName: basename(filePath),
      extension: extname(filePath).toLowerCase(),
      sizeBytes: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      contentHash,
      status: inspection.status,
      supportLevel: inspection.supportLevel,
      mapName: inspection.summary.mapName,
      playedAt: inspection.summary.playedAt,
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
