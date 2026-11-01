import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { replayProfilePlayer } from './display'

export type ReplayResults = {
  total: number
  wins: number
  losses: number
  draws: number
  unknown: number
  winRate: number | null
}
export type ReplayStatistics = {
  overall: ReplayResults
  duplicates: number
  missingDates: number
  maps: { key: string | null; results: ReplayResults }[]
  matchups: { key: string; results: ReplayResults }[]
  months: { key: string; results: ReplayResults }[]
}
function emptyResults(): ReplayResults {
  return { total: 0, wins: 0, losses: 0, draws: 0, unknown: 0, winRate: null }
}
function add(results: ReplayResults, result: ReturnType<typeof replayProfilePlayer>): void {
  results.total++
  switch (result?.result) {
    case 'win':
      results.wins++
      break
    case 'loss':
      results.losses++
      break
    case 'draw':
      results.draws++
      break
    default:
      results.unknown++
  }
  const decided = results.wins + results.losses
  results.winRate = decided ? results.wins / decided : null
}

/** Uses indexed metadata only; never infers results, races or dates from filenames. */
export function buildReplayStatistics(records: ReplayRecord[]): ReplayStatistics {
  const overall = emptyResults()
  const hashes = new Set<string>()
  const maps = new Map<string | null, ReplayResults>()
  const matchups = new Map<string, ReplayResults>()
  const months = new Map<string, ReplayResults>()
  let duplicates = 0
  let missingDates = 0
  for (const record of records) {
    if (record.contentHash) {
      if (hashes.has(record.contentHash)) {
        duplicates++
        continue
      }
      hashes.add(record.contentHash)
    }
    const player = record.status === 'corrupt' ? null : replayProfilePlayer(record)
    add(overall, player)
    const map = record.mapName?.trim() || null
    if (!maps.has(map)) maps.set(map, emptyResults())
    add(maps.get(map)!, player)
    const date = record.playedAt ? new Date(record.playedAt) : null
    if (date && Number.isFinite(date.getTime())) {
      const month = date.toISOString().slice(0, 7)
      if (!months.has(month)) months.set(month, emptyResults())
      add(months.get(month)!, player)
    } else missingDates++
    if (!player || record.players.length !== 2 || player.team === null) continue
    const opponent = record.players.find((item) => item !== player)
    if (!opponent || opponent.team === null || opponent.team === player.team) continue
    const race = opponent.race?.toLowerCase()
    if (!race || !['terran', 'zerg', 'protoss', 'random'].includes(race)) continue
    if (!matchups.has(race)) matchups.set(race, emptyResults())
    add(matchups.get(race)!, player)
  }
  return {
    overall,
    duplicates,
    missingDates,
    maps: [...maps]
      .map(([key, results]) => ({ key, results }))
      .sort(
        (a, b) => b.results.total - a.results.total || (a.key ?? '').localeCompare(b.key ?? ''),
      ),
    matchups: [...matchups]
      .map(([key, results]) => ({ key, results }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    months: [...months]
      .map(([key, results]) => ({ key, results }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  }
}
