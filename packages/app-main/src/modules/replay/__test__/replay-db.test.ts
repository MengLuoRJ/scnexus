import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReplayDatabase } from '../replay-db'
import type { ReplayRecord } from '../replay'

let directory: string
let database: ReplayDatabase
let dbPath: string

function record(overrides: Partial<ReplayRecord> = {}): ReplayRecord {
  return {
    id: 'replay-1',
    path: 'C:\\Replays\\test.SC2Replay',
    fileName: 'test.SC2Replay',
    extension: '.sc2replay',
    sizeBytes: 123,
    mtimeMs: 1000,
    status: 'unsupported',
    supportLevel: 'unsupported',
    mapName: null,
    gameVersion: null,
    baseBuild: null,
    durationSeconds: null,
    players: [],
    warnings: ['Protocol decoding not implemented'],
    ...overrides,
  }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scnexus-replay-db-'))
  dbPath = join(directory, 'replay.db')
  database = new ReplayDatabase(dbPath)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('ReplayDatabase', () => {
  it('initializes idempotently and persists records across reopen', async () => {
    database.initialize()
    const first = record({
      players: [{ slot: 1, name: '玩家', race: 'Terran', team: 1, result: 'win' }],
    })
    expect(await database.listReplays()).toEqual([])
    expect(await database.upsertReplay(first)).toEqual(first)
    database.initialize()
    expect(await database.listReplays()).toEqual([first])
    database.close()
    database.initialize()
    expect(await database.listReplays()).toEqual([first])
  })

  it('preserves identity on reindex and returns the persisted ID', async () => {
    database.initialize()
    await database.upsertReplay(record())
    const updated = await database.upsertReplay(
      record({ id: 'new-id', mapName: '测试地图', sizeBytes: 456 }),
    )
    expect(updated.id).toBe('replay-1')
    expect(updated.mapName).toBe('测试地图')
    expect(await database.listReplays()).toEqual([updated])
  })

  it('handles concurrent callers without reopening or losing writes', async () => {
    await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        database.initialize()
        return database.upsertReplay(
          record({ id: `id-${i}`, path: `C:\\Replays\\${i}.SC2Replay`, mtimeMs: i }),
        )
      }),
    )
    expect((await database.listReplays()).map((item) => item.id)).toEqual(
      Array.from({ length: 8 }, (_, i) => `id-${7 - i}`),
    )
  })

  it('deletes related runs and replay index in one transaction', async () => {
    database.initialize()
    await database.upsertReplay(record())
    const otherConnection = new DatabaseSync(dbPath)
    try {
      otherConnection
        .prepare(
          'INSERT INTO replay_runs (id, replay_id, kind, status, details_json) VALUES (?, ?, ?, ?, ?)',
        )
        .run('run-1', 'replay-1', 'inspect', 'completed', '{}')
      await database.deleteReplayByPath(record().path)
      expect(await database.listReplays()).toEqual([])
      expect(otherConnection.prepare('SELECT * FROM replay_runs').all()).toEqual([])
    } finally {
      otherConnection.close()
    }
  })

  it('opens an existing version-zero SQLite database without losing rows', async () => {
    database.initialize()
    await database.upsertReplay(record())
    database.close()
    const legacy = new DatabaseSync(dbPath)
    legacy.exec('PRAGMA journal_mode = DELETE; PRAGMA user_version = 0;')
    legacy.close()
    database.initialize()
    expect(await database.listReplays()).toEqual([record()])
  })

  it('rejects corrupt files without replacing their contents', async () => {
    const contents = Buffer.from('not a sqlite database')
    await writeFile(dbPath, contents)
    expect(() => database.initialize()).toThrow('file is not a database')
    expect(await readFile(dbPath)).toEqual(contents)
  })

  it('rejects a newer schema without resetting it', () => {
    const future = new DatabaseSync(dbPath)
    future.exec('PRAGMA user_version = 2')
    future.close()
    expect(() => database.initialize()).toThrow('Unsupported replay database version: 2')
  })
})
