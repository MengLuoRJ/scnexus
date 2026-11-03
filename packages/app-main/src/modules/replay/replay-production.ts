import type { ReplayGameEvents, ReplayInitData, ReplayTrackerEvent } from '@scnexus/replay-parser'
import type { ReplayProductionEvent } from '@scnexus/app-shared/types/replay-insights.type'
import {
  DURATIONS,
  DURATION_HISTORY,
  SUPPORTED_BUILDS,
  chronoAbility,
} from './replay-production-data'

export type ReplayProductionContext = {
  gameEvents?: ReplayGameEvents | null
  initData?: ReplayInitData | null
  gameVersion?: string | null
  playedAt?: string | null
  /** Caller must establish standard melee from replay evidence, not the map title. */
  standardMelee?: boolean
}
type Unit = {
  name: string | null
  owner: number | null
  born: number
  egg: number | null
  init: number | null
  completed: boolean
}
export function productionNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}
export function productionLabel(value: unknown): string | null {
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
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function tag(data: Record<string, unknown>, prefix = 'm_unitTag'): string | null {
  const index = productionNumber(data[`${prefix}Index`])
  const recycle = productionNumber(data[`${prefix}Recycle`])
  return index !== null && index < 16384 && recycle !== null && recycle < 262144
    ? `${index}/${recycle}`
    : null
}
function owner(value: unknown): number | null {
  const id = productionNumber(value)
  return id !== null && id > 0 && id <= 255 ? id : null
}
function model(context: ReplayProductionContext) {
  const parts = context.gameVersion?.split('.').map(Number)
  const build = parts?.length === 4 && parts.every(Number.isSafeInteger) ? parts[3]! : null
  const timestamp = context.playedAt ? Date.parse(context.playedAt) / 1000 : NaN
  const lobby = record(context.initData?.data.m_syncLobbyState)
  const options = record(record(lobby.m_gameDescription).m_gameOptions)
  const slots = record(lobby.m_lobbyState).m_slots
  if (
    context.standardMelee !== true ||
    options.m_cooperative !== false ||
    !Array.isArray(slots) ||
    slots.some((slot) => {
      const commander = record(slot).m_commander
      return commander !== undefined && commander !== null && commander !== '' && commander !== 0
    }) ||
    build === null ||
    !SUPPORTED_BUILDS.has(build) ||
    !Number.isFinite(timestamp) ||
    // Supported sampled builds postdate 5.0.14.
    timestamp < 1732492800 ||
    timestamp > 1793664000
  )
    return null
  return { build, timestamp, version: `lotv-spawningtool3-${build}-${timestamp}` }
}

/** Lifecycle observations with optional conservative, version-qualified timing inference. */
export function createReplayProduction(
  events: ReplayTrackerEvent[],
  context: ReplayProductionContext | undefined,
  emit: (id: number, event: ReplayProductionEvent) => void,
): (event: ReplayTrackerEvent) => void {
  const units = new Map<string, Unit>()
  const indexTags = new Map<number, string>()
  const users = new Map<number, number | null>()
  for (const event of events) {
    if (!event.eventType.endsWith('.SPlayerSetupEvent')) continue
    const user = productionNumber(event.data.m_userId)
    const id = owner(event.data.m_playerId)
    if (user !== null && id !== null)
      users.set(user, users.has(user) && users.get(user) !== id ? null : id)
  }
  const resolved = context ? model(context) : null
  const link = resolved ? chronoAbility(resolved.build) : null
  const game = context?.gameEvents
  const chronoAvailable =
    link !== null && game?.baseBuild === resolved?.build && game?.compatibility.state === 'verified'
  const casts = chronoAvailable
    ? game.events.filter((event) => {
        const ability = record(event.data.m_abil)
        return (
          event.eventType === 'NNet.Game.SCmdEvent' &&
          ability.m_abilLink === link &&
          ability.m_abilCmdIndex === 0
        )
      })
    : []
  const push = (
    id: number | null,
    loop: number,
    kind: ReplayProductionEvent['kind'],
    name: string | null,
    count: number | null = 1,
    directStart: number | null = null,
    end: ReplayProductionEvent['endSource'] = null,
    creator: string | null = null,
  ): void => {
    if (id === null || loop <= 0 || name === null) return
    const output: ReplayProductionEvent = { gameLoop: loop, kind, name, count }
    if (context) {
      output.startGameLoop = directStart
      output.endGameLoop = end ? loop : null
      output.startSource =
        directStart !== null
          ? kind === 'construction-started' || kind === 'construction-completed'
            ? 'tracker-init'
            : 'tracker-egg'
          : null
      output.endSource = end
      output.timingBasis = directStart !== null ? 'observed' : 'unavailable'
      output.durationVersion = null
      const duration = Object.hasOwn(DURATIONS, name) ? DURATIONS[name] : undefined
      const producer = creator ? units.get(creator) : undefined
      const producerMatches =
        producer &&
        producer.owner === id &&
        producer.completed &&
        producer.name !== null &&
        producer.name !== 'WarpGate' &&
        duration?.from.includes(producer.name)
      output.chrono = {
        state:
          chronoAvailable && producerMatches && duration?.race === 'P'
            ? 'not-observed'
            : 'unavailable',
        castGameLoops: [],
        abilityLink: link,
        producerTag: creator,
      }
      // A completion alone cannot distinguish warp-in, hallucination or alternate paths.
      if (directStart === null && end && resolved && duration && producerMatches) {
        const historical = DURATION_HISTORY[name]?.find(([before]) => resolved.timestamp < before)
        const loops = historical?.[1] ?? duration.loops
        let start = loop - loops
        const relevant =
          duration.race === 'P'
            ? casts.filter((cast) => {
                const target = record(record(cast.data.m_data).TargetUnit)
                const packed = productionNumber(target.m_tag)
                const targetTag =
                  packed === null ? null : `${Math.floor(packed / 262144)}/${packed % 262144}`
                return (
                  users.get(cast.userId) === id &&
                  (target.m_snapshotUpkeepPlayerId === undefined ||
                    target.m_snapshotUpkeepPlayerId === id) &&
                  targetTag === creator &&
                  cast.gameLoop >= producer.born &&
                  cast.gameLoop < loop
                )
              })
            : []
        // Integrate work backwards at 1.5x during the union of 20 real-second windows.
        const ranges: [number, number][] = []
        for (const cast of relevant.sort((a, b) => a.gameLoop - b.gameLoop)) {
          const range: [number, number] = [cast.gameLoop, Math.min(loop, cast.gameLoop + 448)]
          const previous = ranges.at(-1)
          if (previous && previous[1] >= range[0]) previous[1] = Math.max(previous[1], range[1])
          else ranges.push(range)
        }
        let remaining = loops
        let cursor = loop
        for (const [begin, finish] of ranges.toReversed()) {
          const normal = cursor - finish
          if (remaining <= normal) break
          remaining -= normal
          cursor = finish
          const work = (finish - begin) * 1.5
          if (remaining <= work) {
            start = cursor - remaining / 1.5
            remaining = 0
            break
          }
          remaining -= work
          cursor = begin
        }
        if (remaining > 0) start = cursor - remaining
        if (start >= producer.born && start <= loop) {
          output.startGameLoop = start
          output.startSource = 'versioned-duration'
          output.timingBasis = 'inferred'
          output.durationVersion = resolved.version
          const applied = relevant.filter(
            (cast) => cast.gameLoop < loop && cast.gameLoop + 448 > start,
          )
          if (applied.length)
            output.chrono = {
              state: 'adjusted',
              castGameLoops: applied.map((cast) => cast.gameLoop),
              abilityLink: link,
              producerTag: creator,
            }
        }
      }
    }
    emit(id, output)
  }
  return ({ eventType, gameLoop, data }) => {
    const key = tag(data)
    const unit = key ? units.get(key) : undefined
    switch (eventType) {
      case 'NNet.Replay.Tracker.SUpgradeEvent':
        push(
          owner(data.m_playerId),
          gameLoop,
          'upgrade-completed',
          productionLabel(data.m_upgradeTypeName),
          typeof data.m_count === 'number' && Number.isFinite(data.m_count) && data.m_count >= 0
            ? data.m_count
            : null,
          null,
          'tracker-upgrade',
        )
        break
      case 'NNet.Replay.Tracker.SUnitInitEvent':
      case 'NNet.Replay.Tracker.SUnitBornEvent': {
        if (unit) break
        const id = owner(data.m_upkeepPlayerId)
        const name = productionLabel(data.m_unitTypeName)
        const creatorKey = tag(data, 'm_creatorUnitTag')
        const creator = creatorKey ? units.get(creatorKey) : undefined
        const egg =
          creator?.name === 'Egg' && creator.owner === id && creator.born <= gameLoop
            ? creator.egg
            : null
        const init = eventType.endsWith('.SUnitInitEvent')
        if (key) {
          const index = productionNumber(data.m_unitTagIndex)!
          const old = indexTags.get(index)
          if (old) units.delete(old)
          indexTags.set(index, key)
          units.set(key, {
            name,
            owner: id,
            born: gameLoop,
            egg: name === 'Egg' ? gameLoop : null,
            init: init ? gameLoop : null,
            completed: !init,
          })
        }
        push(
          id,
          gameLoop,
          init ? 'construction-started' : 'unit-born',
          name,
          1,
          init ? gameLoop : (egg ?? null),
          init ? null : 'tracker-born',
          creatorKey,
        )
        break
      }
      case 'NNet.Replay.Tracker.SUnitOwnerChangeEvent':
        if (unit && unit.owner !== owner(data.m_upkeepPlayerId)) {
          unit.owner = owner(data.m_upkeepPlayerId)
          unit.born = gameLoop
          unit.egg = null
          unit.init = null
        }
        break
      case 'NNet.Replay.Tracker.SUnitTypeChangeEvent': {
        if (!unit) break
        const name = productionLabel(data.m_unitTypeName)
        const previous = unit.name
        if (name === previous) break
        if (
          context &&
          name &&
          previous &&
          Object.hasOwn(DURATIONS, name) &&
          DURATIONS[name]?.morph &&
          DURATIONS[name]?.from.includes(previous)
        )
          push(unit.owner, gameLoop, 'morph-completed', name, 1, null, 'tracker-type-change', key)
        unit.name = name
        unit.born = gameLoop
        unit.egg = name === 'Egg' ? gameLoop : null
        // A cancelled/changed construction must not inherit its earlier init observation.
        unit.init = null
        break
      }
      case 'NNet.Replay.Tracker.SUnitDoneEvent':
        if (unit && !unit.completed) {
          if (unit.init !== null && unit.init > 0)
            push(
              unit.owner,
              gameLoop,
              'construction-completed',
              unit.name,
              1,
              unit.init,
              'tracker-done',
            )
          unit.completed = true
          unit.born = gameLoop
        }
        break
      case 'NNet.Replay.Tracker.SUnitDiedEvent':
        if (key) {
          units.delete(key)
          const index = productionNumber(data.m_unitTagIndex)
          if (index !== null && indexTags.get(index) === key) indexTags.delete(index)
        }
        break
    }
  }
}
