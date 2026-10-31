import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
vi.mock('../../../stores/setting', () => ({ settingRepository: { getKey: () => '' } }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '' } }))
vi.mock('../../../utils/7zip-wrapper', () => ({ SevenZipWrapper: class {} }))
import { analyzeLocalReplay } from '../replay-analysis'
import { inspectLocalReplay } from '../replay-inspection'
import { openMpq } from '../../../utils/mpq'
import { parseReplayTrackerEvents } from '@scnexus/replay-parser'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'

// Opt-in, read-only validation. Never persists replay bytes or analysis output.
it.skipIf(!process.env.SCNEXUS_LOCAL_REPLAY)(
  'decodes a local replay through the main analyzer',
  async () => {
    const path = process.env.SCNEXUS_LOCAL_REPLAY!
    const before = await stat(path)
    const inspection = await inspectLocalReplay(path)
    const archive = await openMpq(path)
    let hash: string
    try {
      const tracker = parseReplayTrackerEvents(
        await archive.readFile('replay.tracker.events'),
        inspection.summary.baseBuild!,
      )
      const canonical = (value: unknown): unknown =>
        Array.isArray(value)
          ? value.map(canonical)
          : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value)
                  .sort(([a], [b]) => a.localeCompare(b, 'en'))
                  .map(([key, item]) => [key, canonical(item)]),
              )
            : value
      hash = createHash('sha256')
        .update(JSON.stringify(canonical(tracker.events)))
        .digest('hex')
      const oracleHash = process.env.SCNEXUS_TRACKER_ORACLE_SHA256
      if (oracleHash && hash !== oracleHash) throw new Error('Tracker oracle hash mismatch')
    } finally {
      await archive.close()
    }
    const result = await analyzeLocalReplay({
      id: 'local-read-only-validation',
      path,
      contentHash: 'validation-only',
      baseBuild: inspection.summary.baseBuild,
      players: inspection.summary.players,
    } as ReplayRecord)
    expect(result.insights?.players.length).toBeGreaterThan(0)
    expect(result.insights?.players.every((player) => player.economy.length > 0)).toBe(true)
    expect(result.insights?.players.some((player) => player.production.length > 0)).toBe(true)
    expect(result.status).not.toBe('corrupt')
    const after = await stat(path)
    expect({ size: after.size, mtimeMs: after.mtimeMs }).toEqual({
      size: before.size,
      mtimeMs: before.mtimeMs,
    })
    console.log(
      JSON.stringify({
        baseBuild: result.baseBuild,
        status: result.status,
        trackerHash: hash,
        warnings: result.warnings,
        players: result.insights?.players.map((player) => ({
          slot: player.slot,
          economy: player.economy.length,
          production: player.production.length,
        })),
      }),
    )
  },
  30_000,
)
