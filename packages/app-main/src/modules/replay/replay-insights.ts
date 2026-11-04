import { buildReplayEconomySample } from './replay-stats'
import { createReplayProduction } from './replay-production'
import type { ReplayProductionContext } from './replay-production'
export type { ReplayProductionContext } from './replay-production'
import type { ReplayTrackerEvents } from '@scnexus/replay-parser'
import type { ReplayPlayer } from '@scnexus/app-shared/types/replay.type'
import type {
  ReplayInsights,
  ReplayPlayerInsights,
} from '@scnexus/app-shared/types/replay-insights.type'

export const REPLAY_INSIGHTS_VERSION = 'tracker-insights-v5-identity'

function nonnegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
function integer(value: unknown, max: number): number | null {
  const number = nonnegative(value)
  return number !== null && Number.isSafeInteger(number) && number <= max ? number : null
}
function playerId(value: unknown): number | null {
  const id = integer(value, 255)
  return id === 0 ? null : id
}
/** Tracker observations, not commands, spending totals, or a localized game-data build order. */
export function buildReplayInsights(
  tracker: ReplayTrackerEvents,
  players: ReplayPlayer[],
  context?: ReplayProductionContext,
): ReplayInsights {
  // Match the parser ceiling; never return a silently truncated timeline.
  if (tracker.events.length > 100_000) throw new RangeError('Replay insights event limit exceeded')
  const events = tracker.events
    .filter((event) => integer(event.gameLoop, Number.MAX_SAFE_INTEGER) !== null)
    .sort((a, b) => a.gameLoop - b.gameLoop)
  const setups = new Map<number, number | null>()
  const slotPlayers = new Map<number, Set<number>>()
  for (const event of events) {
    if (event.eventType !== 'NNet.Replay.Tracker.SPlayerSetupEvent') continue
    const id = playerId(event.data.m_playerId)
    if (id === null) continue
    // m_slotId is zero-based; m_userId belongs to the separate game-event user namespace.
    const slotId = integer(event.data.m_slotId, 255)
    const slot = slotId === null ? null : slotId + 1
    setups.set(id, setups.has(id) && setups.get(id) !== slot ? null : slot)
    if (slot !== null) {
      const identities = slotPlayers.get(slot) ?? new Set<number>()
      identities.add(id)
      slotPlayers.set(slot, identities)
    }
  }
  const projections = new Map<number, ReplayPlayerInsights>()
  const getPlayer = (id: number): ReplayPlayerInsights => {
    let projection = projections.get(id)
    if (!projection) {
      const slot = setups.get(id)
      const matches =
        slot == null || slotPlayers.get(slot)?.size !== 1
          ? []
          : players.filter((player) => player.slot === slot)
      const player = matches.length === 1 ? matches[0] : undefined
      projection = {
        playerId: id,
        slot: player?.slot ?? null,
        name: player?.name ?? null,
        economy: [],
        production: [],
      }
      projections.set(id, projection)
    }
    return projection
  }
  const production = createReplayProduction(events, context, (id, event) =>
    getPlayer(id).production.push(event),
  )
  for (const event of events) {
    production(event)
    const { eventType, gameLoop, data } = event
    switch (eventType) {
      case 'NNet.Replay.Tracker.SPlayerStatsEvent': {
        const id = playerId(data.m_playerId)
        if (id === null) break
        const stats = data.m_stats
        if (!stats || typeof stats !== 'object' || Array.isArray(stats)) break
        getPlayer(id).economy.push(
          buildReplayEconomySample(gameLoop, stats as Record<string, unknown>),
        )
        break
      }
    }
  }
  return {
    version: REPLAY_INSIGHTS_VERSION,
    timeBasis: 'game-loops-16',
    players: [...projections.values()].sort((a, b) => a.playerId - b.playerId),
  }
}
