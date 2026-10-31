import type { ReplayTrackerEvents } from '@scnexus/replay-parser'
import type { ReplayPlayer } from '@scnexus/app-shared/types/replay.type'
import type {
  ReplayInsights,
  ReplayPlayerInsights,
  ReplayProductionEvent,
} from '@scnexus/app-shared/types/replay-insights.type'

export const REPLAY_INSIGHTS_VERSION = 'tracker-insights-v1'

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
function label(value: unknown): string | null {
  // Protocol blobs retain decoded UTF-8 text; binary/non-UTF-8 IDs have no safe display label.
  if (
    value &&
    typeof value === 'object' &&
    'kind' in value &&
    value.kind === 'blob' &&
    'text' in value
  )
    value = value.text
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 ? value : null
}

type PendingUnit = {
  recycle: number
  owner: number | null
  name: string | null
  startedAfterZero: boolean
}

/** Tracker observations, not commands, spending totals, or a localized game-data build order. */
export function buildReplayInsights(
  tracker: ReplayTrackerEvents,
  players: ReplayPlayer[],
): ReplayInsights {
  // Match the parser ceiling; never return a silently truncated timeline.
  if (tracker.events.length > 100_000) throw new RangeError('Replay insights event limit exceeded')
  const events = tracker.events
    .filter((event) => integer(event.gameLoop, Number.MAX_SAFE_INTEGER) !== null)
    .sort((a, b) => a.gameLoop - b.gameLoop)
  const setups = new Map<number, number | null>()
  for (const event of events) {
    if (event.eventType !== 'NNet.Replay.Tracker.SPlayerSetupEvent') continue
    const id = playerId(event.data.m_playerId)
    if (id === null) continue
    // m_slotId is zero-based; m_userId belongs to the separate game-event user namespace.
    const slotId = integer(event.data.m_slotId, 255)
    const slot = slotId === null ? null : slotId + 1
    setups.set(id, setups.has(id) && setups.get(id) !== slot ? null : slot)
  }
  const projections = new Map<number, ReplayPlayerInsights>()
  const getPlayer = (id: number): ReplayPlayerInsights => {
    let projection = projections.get(id)
    if (!projection) {
      const slot = setups.get(id)
      const matches = slot == null ? [] : players.filter((player) => player.slot === slot)
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
  const production = (
    id: number | null,
    gameLoop: number,
    kind: ReplayProductionEvent['kind'],
    name: string | null,
    count: number | null = 1,
  ): void => {
    if (id !== null && gameLoop > 0 && name !== null)
      getPlayer(id).production.push({ gameLoop, kind, name, count })
  }
  const pending = new Map<number, PendingUnit>()
  for (const { eventType, gameLoop, data } of events) {
    switch (eventType) {
      case 'NNet.Replay.Tracker.SPlayerStatsEvent': {
        const id = playerId(data.m_playerId)
        if (id === null) break
        const stats = data.m_stats
        if (!stats || typeof stats !== 'object' || Array.isArray(stats)) break
        const fields = stats as Record<string, unknown>
        const stat = (field: string): number | null => nonnegative(fields[`m_scoreValue${field}`])
        const food = (field: string): number | null => {
          const value = stat(field)
          return value === null ? null : value / 4096
        }
        getPlayer(id).economy.push({
          gameLoop,
          minerals: stat('MineralsCurrent'),
          vespene: stat('VespeneCurrent'),
          mineralIncome: stat('MineralsCollectionRate'),
          vespeneIncome: stat('VespeneCollectionRate'),
          workers: stat('WorkersActiveCount'),
          supplyUsed: food('FoodUsed'),
          supplyCap: food('FoodMade'),
          armyMinerals: stat('MineralsUsedCurrentArmy'),
          armyVespene: stat('VespeneUsedCurrentArmy'),
        })
        break
      }
      case 'NNet.Replay.Tracker.SUpgradeEvent':
        production(
          playerId(data.m_playerId),
          gameLoop,
          'upgrade-completed',
          label(data.m_upgradeTypeName),
          nonnegative(data.m_count),
        )
        break
      case 'NNet.Replay.Tracker.SUnitBornEvent':
      case 'NNet.Replay.Tracker.SUnitInitEvent': {
        const index = integer(data.m_unitTagIndex, 0xffffffff)
        const recycle = integer(data.m_unitTagRecycle, 0xffffffff)
        const owner = playerId(data.m_upkeepPlayerId)
        const name = label(data.m_unitTypeName)
        if (index !== null) {
          pending.delete(index)
          if (eventType === 'NNet.Replay.Tracker.SUnitInitEvent' && recycle !== null)
            pending.set(index, { recycle, owner, name, startedAfterZero: gameLoop > 0 })
        }
        // Init/Done also covers warp-ins, not only buildings. Keep raw type IDs honest.
        production(
          owner,
          gameLoop,
          eventType === 'NNet.Replay.Tracker.SUnitBornEvent' ? 'unit-born' : 'construction-started',
          name,
        )
        break
      }
      case 'NNet.Replay.Tracker.SUnitDoneEvent':
      case 'NNet.Replay.Tracker.SUnitDiedEvent':
      case 'NNet.Replay.Tracker.SUnitOwnerChangeEvent':
      case 'NNet.Replay.Tracker.SUnitTypeChangeEvent': {
        const index = integer(data.m_unitTagIndex, 0xffffffff)
        const unit = index === null ? undefined : pending.get(index)
        if (!unit || unit.recycle !== integer(data.m_unitTagRecycle, 0xffffffff)) break
        if (eventType === 'NNet.Replay.Tracker.SUnitOwnerChangeEvent') {
          unit.owner = playerId(data.m_upkeepPlayerId)
        } else if (eventType === 'NNet.Replay.Tracker.SUnitTypeChangeEvent') {
          unit.name = label(data.m_unitTypeName)
        } else {
          if (eventType === 'NNet.Replay.Tracker.SUnitDoneEvent' && unit.startedAfterZero)
            production(unit.owner, gameLoop, 'construction-completed', unit.name)
          pending.delete(index!)
        }
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
