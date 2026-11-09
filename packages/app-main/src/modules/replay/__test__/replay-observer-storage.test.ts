import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'
import { readReplayObserverInput } from '../replay-observer-storage'
import type { ReplayObserverDatabaseSource } from '../replay-observer-storage'
import type { ReplayObserverInput } from '../replay-observer'

let directory: string
let db: DatabaseSync
let source: ReplayObserverDatabaseSource
const input: ReplayObserverInput = {
  replayId: 'replay',
  contentHash: 'a'.repeat(64),
  parserVersion: 'test',
  spatial: {
    version: 1,
    baseBuild: 98310,
    durationGameLoops: 100,
    partial: false,
    diagnostics: [],
    units: [],
  },
}
const unavailable = { code: ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code }
beforeEach(async () => {
  directory = await mkdtemp(join(process.cwd(), 'scnexus-observer-db-'))
  source = {
    databasePath: join(directory, 'replay.db'),
    analysisToken: 'legacy:components',
    replayId: input.replayId,
    contentHash: input.contentHash,
    parserVersion: input.parserVersion,
  }
  db = new DatabaseSync(source.databasePath)
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE replay_files(id TEXT PRIMARY KEY, content_hash TEXT);
    CREATE TABLE replay_runs(id TEXT PRIMARY KEY, replay_id TEXT, kind TEXT, details_json TEXT);`)
  db.prepare('INSERT INTO replay_files VALUES (?, ?)').run(input.replayId, input.contentHash)
  db.prepare('INSERT INTO replay_runs VALUES (?, ?, ?, ?)').run(
    source.analysisToken,
    input.replayId,
    'components',
    JSON.stringify({ ...input, components: { tracker: ['raw-marker'] } }),
  )
})
afterEach(async () => {
  db.close()
  await rm(directory, { recursive: true, force: true })
})

test('reads a projection from the existing WAL database, including legacy run ids', () => {
  const result = readReplayObserverInput(source)
  expect(result).toEqual(input)
  expect(result).not.toHaveProperty('components')
  expect(JSON.stringify(result)).not.toContain('raw-marker')
  expect(db.prepare('SELECT count(*) AS count FROM replay_runs').get()!.count).toBe(1)
})

test.each([
  { replayId: 'other' },
  { contentHash: 'b'.repeat(64) },
  { parserVersion: 'old' },
  { spatial: null },
  { spatial: undefined },
])('rejects mismatched or missing analysis data: %j', (change) => {
  db.prepare('UPDATE replay_runs SET details_json = ?').run(JSON.stringify({ ...input, ...change }))
  expect(() => readReplayObserverInput(source)).toThrow(expect.objectContaining(unavailable))
})

test.each([
  { analysisToken: 'replaced-run' },
  { replayId: 'other' },
  { contentHash: 'b'.repeat(64) },
])('pins the query to the requested record and indexed identity: %j', (change) => {
  expect(() => readReplayObserverInput({ ...source, ...change })).toThrow(
    expect.objectContaining(unavailable),
  )
})

test.each(['reindex', 'deleted', 'kind'])('rejects unavailable rows after %s', (change) => {
  if (change === 'reindex')
    db.prepare('UPDATE replay_files SET content_hash = ?').run('b'.repeat(64))
  else if (change === 'deleted') db.exec('DELETE FROM replay_files')
  else db.exec("UPDATE replay_runs SET kind = 'other'")
  expect(() => readReplayObserverInput(source)).toThrow(expect.objectContaining(unavailable))
})

test('rejects a stale token after analysis replacement even when hash and version match', () => {
  db.prepare('UPDATE replay_runs SET id = ?').run('new-run')
  expect(() => readReplayObserverInput(source)).toThrow(expect.objectContaining(unavailable))
  expect(readReplayObserverInput({ ...source, analysisToken: 'new-run' })).toEqual(input)
})

test('surfaces malformed JSON and does not create a missing database', () => {
  db.prepare('UPDATE replay_runs SET details_json = ?').run('{')
  expect(() => readReplayObserverInput(source)).toThrow('malformed JSON')
  const missing = join(directory, 'missing.db')
  expect(() => readReplayObserverInput({ ...source, databasePath: missing })).toThrow(
    'unable to open database file',
  )
  expect(existsSync(missing)).toBe(false)
})
