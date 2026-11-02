import type { ReplayGameEvents, ReplayTrackerEvents } from '@scnexus/replay-parser'
import type { ReplayPlayer } from '@scnexus/app-shared/types/replay.type'
import type {
  ReplayMetrics,
  ReplayPlayerMetrics,
  ReplayUnitMetrics,
} from '@scnexus/app-shared/types/replay-insights.type'

export const REPLAY_METRICS_VERSION = 'raw-metrics-v1'
const PREFIX = 'NNet.Replay.Tracker.S'
function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}
function id(value: unknown): number | null {
  const n = integer(value)
  return n !== null && n > 0 && n <= 255 ? n : null
}
function text(value: unknown): string | null {
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
function nonnegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
type Unit = {
  recycle: number
  owner: number | null
  name: string | null
  initial: boolean
  born: boolean
  started: boolean
  completed: boolean
}

/** Shared by every replay mode; all counters describe raw decoded events, not inferred game intent. */
export function buildReplayMetrics(
  tracker: ReplayTrackerEvents | null,
  game: ReplayGameEvents | null,
  players: ReplayPlayer[],
): ReplayMetrics {
  if ((tracker?.events.length ?? 0) > 100_000 || (game?.events.length ?? 0) > 100_000)
    throw new RangeError('Replay metrics event limit exceeded')
  const events = (tracker?.events ?? [])
    .filter((event) => integer(event.gameLoop) !== null)
    .sort((a, b) => a.gameLoop - b.gameLoop)
  const slots = new Map<number, number | null>()
  const users = new Map<number, number | null>()
  const bind = (map: Map<number, number | null>, key: number, value: number | null): void => {
    map.set(key, map.has(key) && map.get(key) !== value ? null : value)
  }
  for (const event of events) {
    if (event.eventType !== `${PREFIX}PlayerSetupEvent`) continue
    const player = id(event.data.m_playerId)
    if (player === null) continue
    const slot = integer(event.data.m_slotId)
    bind(slots, player, slot !== null && slot < 255 ? slot + 1 : null)
    const user = integer(event.data.m_userId)
    if (user !== null && user <= 255) bind(users, user, player)
  }
  // Conflicting many-to-one mappings are not evidence of identity.
  const userMappings = [...users]
  for (const [user, player] of userMappings) {
    if (player !== null && userMappings.filter(([, value]) => value === player).length > 1)
      users.set(user, null)
  }
  const rows = new Map<number, ReplayPlayerMetrics>()
  const get = (playerId: number): ReplayPlayerMetrics => {
    let row = rows.get(playerId)
    if (!row) {
      const slot = slots.get(playerId)
      const matches = slot == null ? [] : players.filter((player) => player.slot === slot)
      const uniqueSlot = [...slots.values()].filter((value) => value === slot).length === 1
      const player = matches.length === 1 && uniqueSlot ? matches[0] : undefined
      row = {
        playerId,
        userId: null,
        slot: player?.slot ?? null,
        name: player?.name ?? null,
        unitsState: tracker ? (tracker.skippedEvents ? 'partial' : 'available') : 'unavailable',
        kills: tracker ? 0 : null,
        enemyKills: tracker ? 0 : null,
        friendlyKills: tracker ? 0 : null,
        unknownKills: tracker ? 0 : null,
        units: [],
        killTimeline: [],
        armyValue: [],
        apm: {
          actions: null,
          commands: null,
          selections: null,
          controlGroups: null,
          value: null,
          state: 'unavailable',
        },
      }
      rows.set(playerId, row)
    }
    return row
  }
  for (const player of slots.keys()) get(player)
  const unitCounts = new Map<ReplayPlayerMetrics, Map<string, ReplayUnitMetrics>>()
  const count = (owner: number | null, name: string | null): ReplayUnitMetrics | null => {
    if (owner === null || name === null) return null
    const row = get(owner)
    let names = unitCounts.get(row)
    if (!names) {
      names = new Map()
      unitCounts.set(row, names)
    }
    let unit = names.get(name)
    if (!unit) {
      unit = { name, initial: 0, born: 0, started: 0, completed: 0, lost: 0, kills: 0 }
      names.set(name, unit)
      row.units.push(unit)
    }
    return unit
  }
  const units = new Map<number, Unit>()
  let incompleteUnits = false
  const dead = new Set<string>()
  const team = (owner: number | null): number | null => {
    if (owner === null) return null
    const slot = get(owner).slot
    return slot === null ? null : (players.find((player) => player.slot === slot)?.team ?? null)
  }
  for (const { eventType, gameLoop, data } of events) {
    if (eventType === `${PREFIX}PlayerStatsEvent`) {
      const owner = id(data.m_playerId)
      const stats = data.m_stats
      if (owner !== null && stats && typeof stats === 'object' && !Array.isArray(stats)) {
        const fields = stats as Record<string, unknown>
        get(owner).armyValue.push({
          gameLoop,
          minerals: nonnegative(fields.m_scoreValueMineralsUsedCurrentArmy),
          vespene: nonnegative(fields.m_scoreValueVespeneUsedCurrentArmy),
        })
      }
      continue
    }
    const index = integer(data.m_unitTagIndex)
    const recycle = integer(data.m_unitTagRecycle)
    if (index === null || recycle === null || index > 0xffffffff || recycle > 0xffffffff) {
      if (eventType.startsWith(`${PREFIX}Unit`) && !eventType.endsWith('PositionsEvent'))
        incompleteUnits = true
      continue
    }
    const existing = units.get(index)
    let unit = existing?.recycle === recycle ? existing : undefined
    if (eventType === `${PREFIX}UnitBornEvent` || eventType === `${PREFIX}UnitInitEvent`) {
      if (!unit) {
        unit = {
          recycle,
          owner: id(data.m_upkeepPlayerId),
          name: text(data.m_unitTypeName),
          initial: gameLoop === 0,
          born: false,
          started: false,
          completed: false,
        }
        if (unit.name === null) incompleteUnits = true
        units.set(index, unit)
        if (unit.initial) {
          const counts = count(unit.owner, unit.name)
          if (counts) counts.initial++
        }
      }
      const born = eventType === `${PREFIX}UnitBornEvent`
      if (
        born
          ? unit.born || unit.started || unit.completed
          : unit.started || unit.born || unit.completed
      )
        continue
      if (born) {
        unit.born = true
        unit.completed = true
      } else unit.started = true
      if (!unit.initial && gameLoop > 0) {
        const counts = count(unit.owner, unit.name)
        if (counts) {
          if (born) counts.born++
          else counts.started++
        }
      }
      continue
    }
    if (eventType === `${PREFIX}UnitOwnerChangeEvent`) {
      if (!unit) incompleteUnits = true
      if (unit) unit.owner = id(data.m_upkeepPlayerId)
      continue
    }
    if (eventType === `${PREFIX}UnitTypeChangeEvent`) {
      if (!unit) incompleteUnits = true
      if (unit) {
        unit.name = text(data.m_unitTypeName)
        if (unit.name === null) incompleteUnits = true
      }
      continue
    }
    if (eventType === `${PREFIX}UnitDoneEvent`) {
      if (!unit) incompleteUnits = true
      if (unit && unit.started && !unit.completed) {
        unit.completed = true
        const counts = !unit.initial && gameLoop > 0 ? count(unit.owner, unit.name) : null
        if (counts) counts.completed++
      }
      continue
    }
    if (eventType !== `${PREFIX}UnitDiedEvent`) continue
    const tag = `${index}:${recycle}`
    if (dead.has(tag)) continue
    dead.add(tag)
    if (!unit) incompleteUnits = true
    if (unit) {
      const counts = count(unit.owner, unit.name)
      if (counts) counts.lost++
      units.delete(index)
    }
    // Old protocols may omit killer-unit tags; only explicit killer player IDs authorize attribution.
    const killer = id(data.m_killerPlayerId)
    if (killer === null) continue
    const row = get(killer)
    row.kills!++
    row.killTimeline.push({ gameLoop, kills: row.kills! })
    const victimTeam = team(unit?.owner ?? null)
    const killerTeam = team(killer)
    if (victimTeam === null || killerTeam === null) row.unknownKills!++
    else if (victimTeam === killerTeam) row.friendlyKills!++
    else row.enemyKills!++
    const killerIndex = integer(data.m_killerUnitTagIndex)
    const killerUnit = killerIndex === null ? undefined : units.get(killerIndex)
    if (
      killerUnit &&
      killerUnit.recycle === integer(data.m_killerUnitTagRecycle) &&
      killerUnit.owner === killer
    ) {
      const counts = count(killer, killerUnit.name)
      if (counts) counts.kills++
    }
  }
  const duration = game ? integer(game.elapsedGameLoops) : null
  const durationGameLoops = duration !== null && duration > 0 ? duration : null
  const warnings: string[] = []
  if (game && durationGameLoops === null)
    warnings.push('APM unavailable: full game stream duration missing')
  if (game?.compatibility.state === 'unverified')
    warnings.push('APM unavailable: unverified game protocol')
  const userRows = new Map<number, ReplayPlayerMetrics>()
  const gameRows = new Set<ReplayPlayerMetrics>()
  const getUser = (userId: number): ReplayPlayerMetrics => {
    let row = userRows.get(userId)
    if (row) return row
    const mapped = users.get(userId)
    if (mapped != null) row = get(mapped)
    else {
      row = {
        playerId: null,
        userId,
        slot: null,
        name: null,
        unitsState: 'unavailable',
        kills: null,
        enemyKills: null,
        friendlyKills: null,
        unknownKills: null,
        units: [],
        armyValue: [],
        killTimeline: [],
        apm: {
          actions: null,
          commands: null,
          selections: null,
          controlGroups: null,
          value: null,
          state: 'unavailable',
        },
      }
    }
    row.userId = userId
    row.apm = {
      actions: 0,
      commands: 0,
      selections: 0,
      controlGroups: 0,
      value: null,
      state: 'partial',
    }
    userRows.set(userId, row)
    gameRows.add(row)
    return row
  }
  if (game) {
    for (const [user, mapped] of users) if (mapped !== null) getUser(user)
    for (const event of game.events) {
      const user = integer(event.userId)
      if (user === null || user > 255 || integer(event.gameLoop) === null) continue
      const row = getUser(user)
      if (event.eventType === 'NNet.Game.SCmdEvent') row.apm.commands!++
      else if (event.eventType === 'NNet.Game.SSelectionDeltaEvent') row.apm.selections!++
      else if (
        event.eventType === 'NNet.Game.SControlGroupUpdateEvent' &&
        [0, 1, 2].some((operation) => event.data.m_controlGroupUpdate === operation)
      )
        row.apm.controlGroups!++
    }
    for (const row of gameRows) {
      row.apm.actions = row.apm.commands! + row.apm.selections! + row.apm.controlGroups!
      if (
        row.playerId !== null &&
        durationGameLoops !== null &&
        game.compatibility.state === 'verified'
      ) {
        row.apm.value = (row.apm.actions * 16 * 60) / durationGameLoops
        row.apm.state = 'available'
      }
    }
  }
  if (incompleteUnits) {
    warnings.push('Unit counts partial: lifecycle or type evidence missing')
    for (const row of rows.values()) row.unitsState = 'partial'
  }
  return {
    version: REPLAY_METRICS_VERSION,
    timeBasis: 'game-loops-16',
    durationGameLoops,
    players: [...rows.values(), ...[...userRows.values()].filter((row) => row.playerId === null)],
    warnings,
  }
}
