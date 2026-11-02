import type { ReplayInitData, ReplayTrackerEvents } from './components.js'
import type { ReplayProtocolValue } from './protocol-decoder.js'

export const REPLAY_COOP_ANALYSIS_VERSION = 'coop-v2'
export type ReplayCoopPlayer = {
  slotId: number
  userId: number | null
  playerId: number | null
  profileHandle: string | null
  commander: string | null
  level: number | null
  prestige: number | null
  masteryLevel: number | null
  masteryTalents: number[] | null
  difficulty: number | null
  brutalPlus: number | null
  retryMutationIndexes: number[] | null
}
export type ReplayCoopSummary = {
  identification: 'confirmed' | 'not-coop' | 'unknown'
  players: ReplayCoopPlayer[]
  /** Raw numeric difficulty, only set when all participant values agree. */
  difficulty: number | null
  mutators:
    | { state: 'unknown'; ids: null }
    | {
        state: 'raw'
        ids: string[]
        source: 'tracker-upgrade'
        completeness: 'unknown'
        evidence: {
          eventType: 'NNet.Replay.Tracker.SUpgradeEvent'
          playerId: 0
          match: 'mutatorinfo-prefix'
        }
      }
}
export type ReplayCoopUnitCount = {
  playerId: number
  unitType: string
  born: number
  started: number
  completed: number
  died: number
  kills: number
}
export type ReplayCoopUpgrade = {
  playerId: number
  upgradeId: string
  count: number
  gameLoop: number
  seconds: number
  source: 'tracker-upgrade'
}
export type ReplayCoopAnalysis = ReplayCoopSummary & {
  version: string
  timeBasis: 'game-loops-16'
  units: {
    state: 'available' | 'partial' | 'unknown'
    counts: ReplayCoopUnitCount[]
    unresolvedEvents: number
    corrections: 'lifecycle-only'
  }
  rewards: { state: 'unknown'; experience: null; bonusExperience: null }
  bonusObjectives: { state: 'unknown'; completionTimesSeconds: null; reason: string }
  upgrades: { state: 'available' | 'partial' | 'unknown'; events: ReplayCoopUpgrade[] }
  timing: {
    state: 'available' | 'unknown'
    observedGameLoops: number | null
    observedSeconds: number | null
  }
  enemyComposition: { state: 'raw' | 'unknown'; raceIds: number[]; waveTypeIds: number[] }
  damage: { state: 'unknown' }
  warnings: string[]
}
function object(value: ReplayProtocolValue | undefined): Record<string, ReplayProtocolValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
function number(value: ReplayProtocolValue | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}
function text(value: ReplayProtocolValue | undefined): string | null {
  const result = object(value).text
  return typeof result === 'string' && result.length > 0 ? result : null
}
function numbers(value: ReplayProtocolValue | undefined): number[] | null {
  return Array.isArray(value) && value.every((item) => number(item) !== null)
    ? (value as number[])
    : null
}
function lobby(initData: ReplayInitData | null) {
  return object(initData?.data.m_syncLobbyState)
}
function slots(initData: ReplayInitData | null) {
  const value = object(lobby(initData).m_lobbyState).m_slots
  return Array.isArray(value) ? value.map(object) : []
}

/** Only the explicit protocol flag classifies co-op; names, teams and commanders are not heuristics. */
export function identifyReplayCoop(initData: ReplayInitData | null): ReplayCoopSummary {
  const flag = object(lobby(initData).m_gameDescription).m_isCoopMode
  const identification = flag === true ? 'confirmed' : flag === false ? 'not-coop' : 'unknown'
  const players: ReplayCoopPlayer[] = []
  if (identification === 'confirmed') {
    slots(initData).forEach((slot, slotId) => {
      if (number(slot.m_userId) === null || slot.m_observe !== 0) return
      players.push({
        slotId,
        userId: number(slot.m_userId),
        playerId: null,
        profileHandle: text(slot.m_toonHandle),
        commander: text(slot.m_commander),
        level: number(slot.m_commanderLevel),
        prestige: number(slot.m_selectedCommanderPrestige),
        masteryLevel: number(slot.m_commanderMasteryLevel),
        masteryTalents: numbers(slot.m_commanderMasteryTalents),
        difficulty: number(slot.m_difficulty),
        brutalPlus: number(slot.m_brutalPlusDifficulty),
        retryMutationIndexes: numbers(slot.m_retryMutationIndexes),
      })
    })
  }
  const difficulty = players[0]?.difficulty ?? null
  return {
    identification,
    players,
    difficulty: players.every((p) => p.difficulty === difficulty) ? difficulty : null,
    mutators: { state: 'unknown', ids: null },
  }
}

/** Raw tracker lifecycle counts, not a claim of trained army, enemy kills, damage or XP. */
export function parseReplayCoop(
  initData: ReplayInitData | null,
  tracker: ReplayTrackerEvents | null,
): ReplayCoopAnalysis {
  const summary = identifyReplayCoop(initData)
  const result: ReplayCoopAnalysis = {
    ...summary,
    version: REPLAY_COOP_ANALYSIS_VERSION,
    timeBasis: 'game-loops-16',
    units: { state: 'unknown', counts: [], unresolvedEvents: 0, corrections: 'lifecycle-only' },
    rewards: { state: 'unknown', experience: null, bonusExperience: null },
    bonusObjectives: {
      state: 'unknown',
      completionTimesSeconds: null,
      reason:
        'Tracker has no generic bonus-completion event; map-specific entity and success conditions are not independently verified.',
    },
    upgrades: { state: 'unknown', events: [] },
    timing: { state: 'unknown', observedGameLoops: null, observedSeconds: null },
    enemyComposition: { state: 'unknown', raceIds: [], waveTypeIds: [] },
    damage: { state: 'unknown' },
    warnings: [
      'Active mutator names/completeness, reward XP and damage cannot be reliably derived from supported protocol fields.',
      'mutatorinfo upgrade identifiers are raw mod-reported observations, not proof of an active official mutator set.',
      'Unit counts include structures, summons, map entities and friendly kills; commander-specific corrections are not applied.',
      'Observed tracker time uses 16 loops/s and is not mission completion or wall-clock duration.',
    ],
  }
  if (tracker && summary.identification !== 'not-coop') {
    let malformedUpgrades = 0
    for (const event of tracker.events) {
      if (event.eventType !== 'NNet.Replay.Tracker.SUpgradeEvent') continue
      const playerId = number(event.data.m_playerId)
      const upgradeId = text(event.data.m_upgradeTypeName)
      const count = number(event.data.m_count)
      if (playerId === null || upgradeId === null || count === null) {
        malformedUpgrades++
        continue
      }
      result.upgrades.events.push({
        playerId,
        upgradeId,
        count,
        gameLoop: event.gameLoop,
        seconds: event.gameLoop / 16,
        source: 'tracker-upgrade',
      })
    }
    result.upgrades.state = malformedUpgrades || tracker.skippedEvents ? 'partial' : 'available'
    const ids = [
      ...new Set(
        result.upgrades.events
          .filter(
            (upgrade) => upgrade.playerId === 0 && upgrade.upgradeId.startsWith('mutatorinfo'),
          )
          .map((upgrade) => upgrade.upgradeId),
      ),
    ]
    if (ids.length)
      result.mutators = {
        state: 'raw',
        ids,
        source: 'tracker-upgrade',
        completeness: 'unknown',
        evidence: {
          eventType: 'NNet.Replay.Tracker.SUpgradeEvent',
          playerId: 0,
          match: 'mutatorinfo-prefix',
        },
      }
    if (malformedUpgrades)
      result.warnings.push(
        `${malformedUpgrades} malformed upgrade observations were not interpreted.`,
      )
  }
  if (summary.identification !== 'confirmed') return result
  const unique = (key: string) => [
    ...new Set(
      slots(initData)
        .filter((slot) => number(slot.m_userId) !== null && slot.m_observe === 0)
        .map((slot) => number(slot[key]))
        .filter((value): value is number => value !== null),
    ),
  ]
  const raceIds = unique('m_aCEnemyRace'),
    waveTypeIds = unique('m_aCEnemyWaveType')
  result.enemyComposition = {
    state: raceIds.length || waveTypeIds.length ? 'raw' : 'unknown',
    raceIds,
    waveTypeIds,
  }
  if (!tracker) return result
  result.warnings.push(...tracker.warnings)
  let unresolved = 0
  type Unit = { owner: number; type: string; completed: boolean; alive: boolean }
  const units = new Map<string, Unit>()
  const counts = new Map<string, ReplayCoopUnitCount>()
  const count = (owner: number, type: string) => {
    const key = `${owner}:${type}`
    let row = counts.get(key)
    if (!row) {
      row = {
        playerId: owner,
        unitType: type,
        born: 0,
        started: 0,
        completed: 0,
        died: 0,
        kills: 0,
      }
      counts.set(key, row)
    }
    return row
  }
  const tag = (data: Record<string, ReplayProtocolValue>, prefix = 'm_unitTag') => {
    const index = number(data[`${prefix}Index`]),
      recycle = number(data[`${prefix}Recycle`])
    return index === null || recycle === null ? null : `${index}:${recycle}`
  }
  for (const event of tracker.events) {
    const data = event.data
    const kind = event.eventType.split('.').pop()
    if (kind === 'SPlayerSetupEvent') {
      const slotId = number(data.m_slotId),
        userId = number(data.m_userId),
        playerId = number(data.m_playerId)
      const player = result.players.find((p) => p.slotId === slotId && p.userId === userId)
      if (player && playerId !== null) player.playerId = playerId
      continue
    }
    if (
      ![
        'SUnitBornEvent',
        'SUnitInitEvent',
        'SUnitDoneEvent',
        'SUnitDiedEvent',
        'SUnitOwnerChangeEvent',
        'SUnitTypeChangeEvent',
      ].includes(kind ?? '')
    )
      continue
    const key = tag(data)
    if (!key) {
      unresolved++
      continue
    }
    const unit = units.get(key)
    if (kind === 'SUnitBornEvent' || kind === 'SUnitInitEvent') {
      const owner = number(data.m_controlPlayerId),
        type = text(data.m_unitTypeName)
      if (unit || owner === null || !type) {
        unresolved++
        continue
      }
      const completed = kind === 'SUnitBornEvent'
      units.set(key, { owner, type, completed, alive: true })
      count(owner, type)[completed ? 'born' : 'started']++
      if (completed) count(owner, type).completed++
      continue
    }
    if (!unit?.alive) {
      unresolved++
      continue
    }
    if (kind === 'SUnitDoneEvent') {
      if (!unit.completed) {
        unit.completed = true
        count(unit.owner, unit.type).completed++
      }
    } else if (kind === 'SUnitOwnerChangeEvent') {
      const owner = number(data.m_controlPlayerId)
      if (owner === null) unresolved++
      else unit.owner = owner
    } else if (kind === 'SUnitTypeChangeEvent') {
      const type = text(data.m_unitTypeName)
      if (type === null) unresolved++
      else unit.type = type
    } else if (kind === 'SUnitDiedEvent') {
      unit.alive = false
      count(unit.owner, unit.type).died++
      const killerKey = tag(data, 'm_killerUnitTag')
      const killer = killerKey ? units.get(killerKey) : undefined
      const owner = number(data.m_killerPlayerId)
      if (killer && (owner === null || owner === killer.owner))
        count(killer.owner, killer.type).kills++
      else if (owner !== null) count(owner, '<unknown-killer-unit>').kills++
      else unresolved++
    }
  }
  const maxLoop = tracker.events.length
    ? tracker.events.reduce((maximum, event) => Math.max(maximum, event.gameLoop), 0)
    : null
  result.timing = {
    state: maxLoop === null ? 'unknown' : 'available',
    observedGameLoops: maxLoop,
    observedSeconds: maxLoop === null ? null : maxLoop / 16,
  }
  result.units = {
    state: unresolved || tracker.skippedEvents ? 'partial' : 'available',
    counts: [...counts.values()],
    unresolvedEvents: unresolved,
    corrections: 'lifecycle-only',
  }
  if (unresolved)
    result.warnings.push(`${unresolved} lifecycle/kill events could not be fully attributed.`)
  return result
}
