import { expect, test } from 'vitest'
import type { ReplayPlayer, ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { buildReplayStatistics } from '../statistics'

const handle = '5-S2-1-123'
function replay(id: string, overrides: Partial<ReplayRecord> = {}): ReplayRecord {
  return {
    id,
    profileHandle: handle,
    category: 'Multiplayer',
    path: `D:\\${id}.SC2Replay`,
    fileName: `${id}.SC2Replay`,
    extension: '.sc2replay',
    sizeBytes: 1,
    mtimeMs: 1,
    contentHash: id,
    status: 'partial',
    supportLevel: 'metadata-only',
    mapName: 'Map A',
    playedAt: '2026-10-01T00:00:00Z',
    gameVersion: null,
    baseBuild: null,
    durationSeconds: null,
    players: [
      { slot: 1, profileHandle: handle, name: 'Me', race: 'Terran', team: 1, result: 'win' },
      { slot: 2, name: 'Opponent', race: 'Zerg', team: 2, result: 'loss' },
    ],
    warnings: [],
    ...overrides,
  }
}
function result(id: string, value: ReplayPlayer['result']): ReplayRecord {
  const record = replay(id)
  record.players[0]!.result = value
  return record
}
test('deduplicates hashes and excludes draws and unknowns from win rate', () => {
  const stats = buildReplayStatistics([
    replay('win'),
    replay('copy', { contentHash: 'win' }),
    result('loss', 'loss'),
    result('draw', 'draw'),
    result('unknown', null),
    replay('no-hash', { contentHash: null }),
    replay('no-hash-2', { contentHash: null }),
  ])
  expect(stats.duplicates).toBe(1)
  expect(stats.overall).toEqual({
    total: 6,
    wins: 3,
    losses: 1,
    draws: 1,
    unknown: 1,
    winRate: 0.75,
  })
})
test('does not infer the profile player or trust corrupt results', () => {
  const noMatch = replay('absent', { profileHandle: '5-S2-1-999' })
  const ambiguous = replay('ambiguous')
  ambiguous.players[1]!.profileHandle = handle
  const stats = buildReplayStatistics([
    noMatch,
    ambiguous,
    replay('corrupt', { status: 'corrupt' }),
  ])
  expect(stats.overall.unknown).toBe(3)
  expect(stats.overall.winRate).toBeNull()
  expect(stats.matchups).toEqual([])
})
test('uses distinct known teams and known opponent race for 1v1 only', () => {
  const team = replay('team')
  team.players.push({ slot: 3, name: 'Ally', race: 'Protoss', team: 1, result: 'win' })
  const same = replay('same')
  same.players[1]!.team = 1
  const missingTeam = replay('missing-team')
  missingTeam.players[1]!.team = null
  const missingRace = replay('missing-race')
  missingRace.players[1]!.race = null
  const stats = buildReplayStatistics([replay('valid'), team, same, missingTeam, missingRace])
  expect(stats.overall.total).toBe(5)
  expect(stats.maps[0]!.results.total).toBe(5)
  expect(stats.matchups).toEqual([
    { key: 'zerg', results: { total: 1, wins: 1, losses: 0, draws: 0, unknown: 0, winRate: 1 } },
  ])
})
test('groups by UTC played month, not mtime, with missing dates only in totals', () => {
  const stats = buildReplayStatistics([
    replay('oct', { playedAt: '2026-11-01T01:00:00+02:00' }),
    replay('nov', { playedAt: '2026-11-02T00:00:00Z' }),
    replay('null', { playedAt: null }),
    replay('invalid', { playedAt: 'invalid' }),
  ])
  expect(stats.months.map((row) => row.key)).toEqual(['2026-10', '2026-11'])
  expect(stats.missingDates).toBe(2)
  expect(stats.overall.total).toBe(4)
})
test('handles empty libraries and keeps unknown maps explicit', () => {
  expect(buildReplayStatistics([]).overall.winRate).toBeNull()
  expect(buildReplayStatistics([replay('unknown-map', { mapName: null })]).maps[0]!.key).toBeNull()
})
