import { constants } from 'node:fs'
import {
  configuredReplayRoot,
  discoverProfiles,
  resolveReplayScope,
  safeReplayPath,
  contained,
} from './replay-scope'
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
import type { ReplayRecord, ReplayScope } from '@scnexus/app-shared/types/replay.type'
export type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { replayDatabase } from './replay-db'
import { inspectLocalReplay } from './replay-inspection'
import { hashReplayFile } from './replay-files'
import { REPLAY_ANALYSIS_VERSION } from './replay-analysis'
import { runReplayAnalysis } from './replay-analysis-runner'
import { SevenZipWrapper } from '../../utils/7zip-wrapper'

export class ReplayLibraryService {
  private readonly archiveReader = new SevenZipWrapper()

  constructor(private readonly rootDirectory: () => string = configuredReplayRoot) {}

  profiles() {
    return discoverProfiles(this.rootDirectory())
  }

  async ensureReady() {
    await replayDatabase.initialize()
  }

  async listStoredReplays(scope: ReplayScope): Promise<ReplayRecord[]> {
    await this.ensureReady()
    const root = await resolveReplayScope(this.rootDirectory(), scope)
    const records = await replayDatabase.listReplays(scope)
    const visible: ReplayRecord[] = []
    for (const record of records) {
      if (!contained(root, record.path)) continue
      if ((await safeReplayPath(root, record.path, true)) && (await lstat(record.path)).isFile())
        visible.push(record)
    }
    return visible
  }

  private readonly analyses = new Map<
    string,
    Promise<import('@scnexus/app-shared/types/replay.type').ReplayAnalysis>
  >()

  async getAnalysis(scope: ReplayScope, replayId: string) {
    await this.ensureReady()
    const record = await this.requireRecord(scope, replayId)
    const result = await replayDatabase.getAnalysis(replayId)
    if (!result || result.parserVersion !== REPLAY_ANALYSIS_VERSION) return null
    if (!record || (await hashReplayFile(record.path)) !== result.contentHash) return null
    return result
  }

  async analyzeReplay(scope: ReplayScope, replayId: string) {
    await this.requireRecord(scope, replayId)
    const current = this.analyses.get(replayId)
    if (current) return current
    if (this.analyses.size >= 2) throw new Error('At most two replay analyses can run concurrently')
    const job = this.performAnalysis(scope, replayId)
    this.analyses.set(replayId, job)
    try {
      return await job
    } finally {
      this.analyses.delete(replayId)
    }
  }

  private async performAnalysis(scope: ReplayScope, replayId: string) {
    const record = await this.requireRecord(scope, replayId)
    if (!record.contentHash || (await hashReplayFile(record.path)) !== record.contentHash)
      throw new Error('Replay changed; reindex before analysis')
    const result = await runReplayAnalysis(record)
    await this.requireRecord(scope, replayId)
    if ((await hashReplayFile(record.path)) !== record.contentHash)
      throw new Error('Replay changed during analysis')
    await replayDatabase.saveAnalysis(result)
    return result
  }

  async listDuplicates(scope: ReplayScope) {
    const groups = new Map<string, ReplayRecord[]>()
    for (const record of await this.listStoredReplays(scope)) {
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
    scope: ReplayScope,
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
    const stored = new Map(
      (await this.listStoredReplays(scope)).map((record) => [record.id, record]),
    )
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
        await safeReplayPath(await resolveReplayScope(this.rootDirectory(), scope), record.path)
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

  async scan(scope: ReplayScope): Promise<ReplayRecord[]> {
    await this.ensureReady()
    const root = await resolveReplayScope(this.rootDirectory(), scope)
    if (!(await safeReplayPath(root, root, true))) return []
    const results: ReplayRecord[] = []
    const visit = async (directory: string) => {
      await safeReplayPath(root, directory)
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await visit(path)
        else if (entry.isFile() && looksLikeReplay(path))
          results.push(await this.indexReplayFile(scope, path))
      }
    }
    await visit(root)
    return results
  }

  private async requireRecord(scope: ReplayScope, id: string): Promise<ReplayRecord> {
    await this.ensureReady()
    const root = await resolveReplayScope(this.rootDirectory(), scope)
    const record = (await replayDatabase.listReplays(scope)).find((item) => item.id === id)
    if (!record || !contained(root, record.path))
      throw new Error('Replay is not indexed in selected scope')
    await safeReplayPath(root, record.path, true)
    return record
  }

  async importFile(scope: ReplayScope, filePath: string): Promise<ReplayRecord> {
    if (!looksLikeReplay(filePath)) throw new Error('Expected a .SC2Replay file')
    await safeReplayPath(dirname(filePath), filePath)
    if (!(await lstat(filePath)).isFile()) throw new Error('Replay must be a regular file')
    const root = await resolveReplayScope(this.rootDirectory(), scope)
    await mkdir(root, { recursive: true })
    await safeReplayPath(root, root)
    const target = join(root, `${randomUUID()}-${basename(filePath)}`)
    await copyFile(filePath, target, constants.COPYFILE_EXCL)
    return this.indexReplayFile(scope, target)
  }

  private async indexReplayFile(scope: ReplayScope, filePath: string): Promise<ReplayRecord> {
    await this.ensureReady()
    filePath = resolve(filePath)
    await safeReplayPath(await resolveReplayScope(this.rootDirectory(), scope), filePath)
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
      profileHandle: scope.profileHandle,
      category: scope.category,
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

  async importReplayArchive(scope: ReplayScope, archivePath: string): Promise<ReplayRecord[]> {
    await this.ensureReady()
    const destinationDir = await resolveReplayScope(this.rootDirectory(), scope)
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
    await mkdir(destinationDir, { recursive: true })
    await safeReplayPath(destinationDir, destinationDir)
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
    const records: ReplayRecord[] = []
    for (const entry of entries)
      records.push(await this.indexReplayFile(scope, join(outputDir, ...entry.path.split(/[\\/]/))))
    return records
  }

  async deleteReplay(scope: ReplayScope, replayId: string): Promise<void> {
    const record = await this.requireRecord(scope, replayId)
    const filePath = record.path
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
