import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getApplicationDataDirectory } from '../../utils/application-data'
import type { ReplayRecord, ReplayAnalysis } from '@scnexus/app-shared/types/replay.type'

type ReplayDatabaseRow = {
  id: string
  path: string
  file_name: string
  extension: string
  size_bytes: number
  mtime_ms: number
  content_hash: string | null
  status: string
  support_level: string
  map_name: string | null
  played_at: string | null
  game_version: string | null
  base_build: number | null
  duration_seconds: number | null
  players_json: string
  warnings_json: string
  created_at: string
  updated_at: string
}

export class ReplayDatabase {
  private db: DatabaseSync | null = null

  constructor(private readonly databasePath?: string) {}

  initialize(): void {
    if (this.db) return
    const dbPath =
      this.databasePath ?? join(getApplicationDataDirectory(), 'SCNexusStorage', 'replay.db')
    mkdirSync(dirname(dbPath), { recursive: true })
    const db = new DatabaseSync(dbPath)
    try {
      const version = db.prepare('PRAGMA user_version').get()!.user_version as number
      if (version > 3) throw new Error(`Unsupported replay database version: ${version}`)
      db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
      db.exec('BEGIN IMMEDIATE')
      db.exec(`
      CREATE TABLE IF NOT EXISTS replay_files (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        extension TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        mtime_ms REAL NOT NULL,
        status TEXT NOT NULL,
        support_level TEXT NOT NULL,
        map_name TEXT,
        game_version TEXT,
        base_build INTEGER,
        duration_seconds INTEGER,
        players_json TEXT NOT NULL,
        warnings_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
      db.exec(`
      CREATE TABLE IF NOT EXISTS replay_runs (
        id TEXT PRIMARY KEY,
        replay_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (replay_id) REFERENCES replay_files (id)
      );
    `)
      db.exec('CREATE INDEX IF NOT EXISTS replay_files_status_idx ON replay_files(status)')
      const columns = db.prepare('PRAGMA table_info(replay_files)').all()
      if (!columns.some((column) => column.name === 'content_hash')) {
        db.exec('ALTER TABLE replay_files ADD COLUMN content_hash TEXT')
      }
      db.exec('CREATE INDEX IF NOT EXISTS replay_files_hash_idx ON replay_files(content_hash)')
      if (!columns.some((column) => column.name === 'played_at')) {
        db.exec('ALTER TABLE replay_files ADD COLUMN played_at TEXT')
      }
      db.exec('PRAGMA user_version = 3; COMMIT;')
      this.db = db
    } catch (error) {
      db.close()
      throw error
    }
  }

  close(): void {
    this.db?.close()
    this.db = null
  }

  private ensureReady(): DatabaseSync {
    if (!this.db) throw new Error('Replay database is not initialized')
    return this.db
  }

  async upsertReplay(record: ReplayRecord): Promise<ReplayRecord> {
    const db = this.ensureReady()
    const timestamp = new Date().toISOString()
    const params = [
      record.id,
      record.path,
      record.fileName,
      record.extension,
      record.sizeBytes,
      record.mtimeMs,
      record.status,
      record.supportLevel,
      record.mapName,
      record.gameVersion,
      record.baseBuild,
      record.durationSeconds,
      JSON.stringify(record.players),
      JSON.stringify(record.warnings),
      timestamp,
      timestamp,
      record.contentHash,
      record.playedAt,
    ]

    const row = db
      .prepare(
        `
        INSERT INTO replay_files (
          id, path, file_name, extension, size_bytes, mtime_ms, status, support_level,
          map_name, game_version, base_build, duration_seconds, players_json, warnings_json,
          created_at, updated_at, content_hash, played_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          file_name = excluded.file_name,
          extension = excluded.extension,
          size_bytes = excluded.size_bytes,
          mtime_ms = excluded.mtime_ms,
          status = excluded.status,
          support_level = excluded.support_level,
          map_name = excluded.map_name,
          game_version = excluded.game_version,
          base_build = excluded.base_build,
          duration_seconds = excluded.duration_seconds,
          players_json = excluded.players_json,
          warnings_json = excluded.warnings_json,
          updated_at = excluded.updated_at,
          content_hash = excluded.content_hash,
          played_at = excluded.played_at
        RETURNING *
      `,
      )
      .get(...params) as ReplayDatabaseRow | undefined
    if (!row) throw new Error('Replay upsert did not return a record')
    return this.toRecord(row)
  }

  async listReplays(): Promise<ReplayRecord[]> {
    const rows = this.ensureReady()
      .prepare(`
      SELECT * FROM replay_files ORDER BY mtime_ms DESC, path ASC
    `)
      .all() as ReplayDatabaseRow[]
    return rows.map((row) => this.toRecord(row))
  }

  private toRecord(row: ReplayDatabaseRow): ReplayRecord {
    return {
      id: row.id,
      path: row.path,
      fileName: row.file_name,
      extension: row.extension,
      sizeBytes: row.size_bytes,
      mtimeMs: row.mtime_ms,
      contentHash: row.content_hash,
      status: row.status as ReplayRecord['status'],
      supportLevel: row.support_level as ReplayRecord['supportLevel'],
      mapName: row.map_name,
      playedAt: row.played_at,
      gameVersion: row.game_version,
      baseBuild: row.base_build,
      durationSeconds: row.duration_seconds,
      players: JSON.parse(row.players_json ?? '[]') as ReplayRecord['players'],
      warnings: JSON.parse(row.warnings_json ?? '[]') as ReplayRecord['warnings'],
    }
  }

  async saveAnalysis(analysis: ReplayAnalysis): Promise<void> {
    const db = this.ensureReady()
    const record = db
      .prepare('SELECT content_hash FROM replay_files WHERE id = ?')
      .get(analysis.replayId)
    if (!record || record.content_hash !== analysis.contentHash)
      throw new Error('Replay index changed during analysis')
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare("DELETE FROM replay_runs WHERE replay_id = ? AND kind = 'components'").run(
        analysis.replayId,
      )
      db.prepare(
        'INSERT INTO replay_runs (id, replay_id, kind, status, details_json) VALUES (?, ?, ?, ?, ?)',
      ).run(
        `${analysis.replayId}:components`,
        analysis.replayId,
        'components',
        analysis.status,
        JSON.stringify(analysis),
      )
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  async getAnalysis(replayId: string): Promise<ReplayAnalysis | null> {
    const row = this.ensureReady()
      .prepare(`
      SELECT r.details_json FROM replay_runs r JOIN replay_files f ON f.id = r.replay_id
      WHERE r.replay_id = ? AND r.kind = 'components'
    `)
      .get(replayId)
    if (!row) return null
    const analysis = JSON.parse(row.details_json as string) as ReplayAnalysis
    const current = this.ensureReady()
      .prepare('SELECT content_hash FROM replay_files WHERE id = ?')
      .get(replayId)
    return current?.content_hash === analysis.contentHash ? analysis : null
  }

  async deleteReplayByPath(filePath: string): Promise<void> {
    const db = this.ensureReady()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(
        'DELETE FROM replay_runs WHERE replay_id IN (SELECT id FROM replay_files WHERE path = ?)',
      ).run(filePath)
      db.prepare('DELETE FROM replay_files WHERE path = ?').run(filePath)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

export const replayDatabase = new ReplayDatabase()
