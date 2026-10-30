import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { type Database as SqlDatabase } from 'sql.js'
import { getApplicationDataDirectory } from '../../utils/application-data'
import type { ReplayRecord } from './replay'

type ReplayDatabaseRow = {
  id: string
  path: string
  file_name: string
  extension: string
  size_bytes: number
  mtime_ms: number
  status: string
  support_level: string
  map_name: string | null
  game_version: string | null
  base_build: number | null
  duration_seconds: number | null
  players_json: string
  warnings_json: string
  created_at: string
  updated_at: string
}

export class ReplayDatabase {
  private db: SqlDatabase | null = null
  private dbPath = ''

  async initialize(): Promise<void> {
    const dataDirectory = join(getApplicationDataDirectory(), 'SCNexusStorage')
    await mkdir(dataDirectory, { recursive: true })
    this.dbPath = join(dataDirectory, 'replay.db')

    const require = createRequire(import.meta.url)
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    const SQL = await initSqlJs({
      locateFile: (file: string) => (file === 'sql-wasm.wasm' ? wasmPath : require.resolve(`sql.js/dist/${file}`)),
    })

    const fileBuffer = await readFile(this.dbPath).catch(() => null)
    this.db = new SQL.Database(fileBuffer ? new Uint8Array(fileBuffer) : undefined)
    this.db.run(`
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
    this.db.run(`
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
    this.db.run(`CREATE INDEX IF NOT EXISTS replay_files_path_idx ON replay_files(path);`)
    this.db.run(`CREATE INDEX IF NOT EXISTS replay_files_status_idx ON replay_files(status);`)
  }

  private ensureReady() {
    if (!this.db) throw new Error('Replay database is not initialized')
  }

  private async flush(): Promise<void> {
    this.ensureReady()
    if (!this.dbPath) throw new Error('Replay database path is not initialized')
    const db = this.db!
    const data = Buffer.from(db.export())
    await writeFile(this.dbPath, data)
  }

  async upsertReplay(record: ReplayRecord): Promise<ReplayRecord> {
    this.ensureReady()
    const db = this.db!
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
    ]

    db.run(
      `
        INSERT INTO replay_files (
          id, path, file_name, extension, size_bytes, mtime_ms, status, support_level,
          map_name, game_version, base_build, duration_seconds, players_json, warnings_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          updated_at = excluded.updated_at
      `,
      params,
    )

    await this.flush()
    return record
  }

  async listReplays(): Promise<ReplayRecord[]> {
    this.ensureReady()
    const rows = this.db!.exec(`
      SELECT
        id, path, file_name, extension, size_bytes, mtime_ms, status, support_level,
        map_name, game_version, base_build, duration_seconds, players_json, warnings_json
      FROM replay_files
      ORDER BY mtime_ms DESC
    `) as unknown as Array<{ values: ReplayDatabaseRow[] }>

    const first = rows[0]
    if (!first) return []

    return first.values.map((row) => ({
      id: row.id,
      path: row.path,
      fileName: row.file_name,
      extension: row.extension,
      sizeBytes: row.size_bytes,
      mtimeMs: row.mtime_ms,
      status: row.status as ReplayRecord['status'],
      supportLevel: row.support_level as ReplayRecord['supportLevel'],
      mapName: row.map_name,
      gameVersion: row.game_version,
      baseBuild: row.base_build,
      durationSeconds: row.duration_seconds,
      players: JSON.parse(row.players_json ?? '[]') as ReplayRecord['players'],
      warnings: JSON.parse(row.warnings_json ?? '[]') as ReplayRecord['warnings'],
    }))
  }

  async deleteReplayByPath(filePath: string): Promise<void> {
    this.ensureReady()
    this.db!.run('DELETE FROM replay_files WHERE path = ?', [filePath])
    await this.flush()
  }
}

export const replayDatabase = new ReplayDatabase()
