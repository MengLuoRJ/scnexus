import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    profileHandle: null,
    category: null,
    path: 'C:\\Replays\\test.SC2Replay',
    fileName: 'test.SC2Replay',
    extension: '.sc2replay',
    sizeBytes: 123,
    mtimeMs: 1000,
    contentHash: null,
    status: 'unsupported',
    supportLevel: 'unsupported',
    mapName: null,
    playedAt: null,
    gameVersion: null,
    baseBuild: null,
    durationSeconds: null,
    players: [],
    warnings: ['Protocol decoding not implemented'],
    ...overrides,
  }
}

beforeEach(async () => {
  directory = await mkdtemp(join(process.cwd(), 'scnexus-replay-db-'))
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

  it('migrates version-one indexes without discarding identities or metadata', async () => {
    database.initialize()
    await database.upsertReplay(record())
    database.close()
    const legacy = new DatabaseSync(dbPath)
    legacy.exec(
      'DROP INDEX replay_files_hash_idx; ALTER TABLE replay_files DROP COLUMN content_hash; PRAGMA user_version = 1;',
    )
    legacy.close()
    database.initialize()
    expect(await database.listReplays()).toEqual([record()])
  })

  it('migrates version-two records with unknown playedAt and persists real UTC timestamps', async () => {
    database.initialize()
    await database.upsertReplay(record())
    database.close()
    const legacy = new DatabaseSync(dbPath)
    legacy.exec('ALTER TABLE replay_files DROP COLUMN played_at; PRAGMA user_version = 2;')
    legacy.close()
    database.initialize()
    expect((await database.listReplays())[0]!.playedAt).toBeNull()
    const updated = await database.upsertReplay(record({ playedAt: '2026-10-31T10:33:35.000Z' }))
    database.close()
    database.initialize()
    expect(await database.listReplays()).toEqual([updated])
  })

  it('persists versioned component analysis and hides results for changed content', async () => {
    database.initialize()
    await database.upsertReplay(record({ contentHash: 'hash-a' }))
    const analysis = {
      replayId: 'replay-1',
      contentHash: 'hash-a',
      parserVersion: 'test-1',
      insights: {
        version: '1.0.0',
        timeBasis: 'game-loops-16' as const,
        players: [{ playerId: 1, slot: 1, name: 'Player', economy: [], production: [] }],
      },
      baseBuild: 70154,
      status: 'completed' as const,
      components: { initData: { speed: 4 }, attributes: [], tracker: [] },
      warnings: [],
      analyzedAt: '2026-10-31T00:00:00.000Z',
    }
    await database.saveAnalysis(analysis)
    database.close()
    database.initialize()
    expect(await database.getAnalysis('replay-1')).toEqual(analysis)
    await database.upsertReplay(record({ contentHash: 'hash-b' }))
    expect(await database.getAnalysis('replay-1')).toBeNull()
    await expect(database.saveAnalysis(analysis)).rejects.toThrow('index changed')
    await database.deleteReplayByPath(record().path)
    expect(await database.getAnalysis('replay-1')).toBeNull()
  })

  it('rejects a newer schema without resetting it', () => {
    const future = new DatabaseSync(dbPath)
    future.exec('PRAGMA user_version = 5')
    future.close()
    expect(() => database.initialize()).toThrow('Unsupported replay database version: 5')
  })
})
