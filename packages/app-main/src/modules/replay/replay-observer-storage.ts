import { DatabaseSync } from 'node:sqlite'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import type { ReplayObserverInput } from './replay-observer'

export type ReplayObserverDatabaseSource = {
  databasePath: string
  analysisToken: string
  replayId: string
  contentHash: string
  parserVersion: string
}

/** Read only the observer projection in the worker; raw decoded components never become JS objects. */
export function readReplayObserverInput(source: ReplayObserverDatabaseSource): ReplayObserverInput {
  const db = new DatabaseSync(source.databasePath, { readOnly: true })
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    const row = db
      .prepare(`
      SELECT json_extract(r.details_json, '$.replayId', '$.contentHash', '$.parserVersion', '$.spatial') AS observer_json
      FROM replay_runs r JOIN replay_files f ON f.id = r.replay_id
      WHERE r.id = ? AND r.replay_id = ? AND r.kind = 'components' AND f.content_hash = ?
    `)
      .get(source.analysisToken, source.replayId, source.contentHash)
    if (!row) throw new AppError(ERRORS.REPLAY_OBSERVER_UNAVAILABLE)
    const [replayId, contentHash, parserVersion, spatial] = JSON.parse(
      row.observer_json as string,
    ) as unknown[]
    if (
      replayId !== source.replayId ||
      contentHash !== source.contentHash ||
      parserVersion !== source.parserVersion ||
      !spatial ||
      typeof spatial !== 'object'
    )
      throw new AppError(ERRORS.REPLAY_OBSERVER_UNAVAILABLE)
    return {
      replayId,
      contentHash,
      parserVersion,
      spatial: spatial as ReplayObserverInput['spatial'],
    }
  } finally {
    db.close()
  }
}
