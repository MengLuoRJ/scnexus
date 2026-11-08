import type { ReplayTrackerEvents } from './components.js'

export type ReplaySpatialObservation = {
  gameLoop: number
  kind: 'born' | 'init' | 'done' | 'died' | 'owner-change' | 'type-change' | 'position'
  unitType: string | null
  controlPlayerId: number | null
  upkeepPlayerId: number | null
  x: number | null
  y: number | null
  positionGameLoop: number | null
  completed: boolean
}
export type ReplaySpatialUnit = {
  unitTag: string
  unitTagIndex: number
  unitTagRecycle: number
  startedGameLoop: number
  diedGameLoop: number | null
  observations: ReplaySpatialObservation[]
}
export type ReplaySpatialDiagnostic = {
  code:
    | 'incomplete-tracker'
    | 'malformed-event'
    | 'unknown-unit'
    | 'terminal-unit'
    | 'duplicate-unit'
    | 'unsupported-event'
    | 'budget-exceeded'
  gameLoop: number | null
}
export type ReplaySpatialTimeline = {
  version: 1
  baseBuild: number
  durationGameLoops: number
  partial: boolean
  diagnostics: ReplaySpatialDiagnostic[]
  units: ReplaySpatialUnit[]
}

const MAX_EVENTS = 100_000
const MAX_OBSERVATIONS = 200_000
const MAX_UNITS = 50_000
const MAX_DIAGNOSTICS = 256
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const kinds: Record<string, ReplaySpatialObservation['kind']> = {
  SUnitBornEvent: 'born',
  SUnitInitEvent: 'init',
  SUnitDoneEvent: 'done',
  SUnitDiedEvent: 'died',
  SUnitOwnerChangeEvent: 'owner-change',
  SUnitTypeChangeEvent: 'type-change',
  SUnitPositionsEvent: 'position',
}

/** Sparse tracker observations, not trajectories or visibility/command simulation. */
export function buildReplaySpatialTimeline(
  tracker: ReplayTrackerEvents,
  durationGameLoops?: number,
): ReplaySpatialTimeline {
  if (
    !integer(tracker.baseBuild) ||
    (durationGameLoops !== undefined && !integer(durationGameLoops))
  ) {
    throw new RangeError('Build and duration must be non-negative safe integers')
  }
  const result: ReplaySpatialTimeline = {
    version: 1,
    baseBuild: tracker.baseBuild,
    durationGameLoops: durationGameLoops ?? 0,
    partial: false,
    diagnostics: [],
    units: [],
  }
  const diagnose = (code: ReplaySpatialDiagnostic['code'], gameLoop: number | null) => {
    result.partial = true
    if (result.diagnostics.length < MAX_DIAGNOSTICS) result.diagnostics.push({ code, gameLoop })
  }
  if (tracker.skippedEvents || tracker.unknownEventIds.length || tracker.warnings.length)
    diagnose('incomplete-tracker', null)
  if (tracker.events.length > MAX_EVENTS) diagnose('budget-exceeded', null)
  const byTag = new Map<string, ReplaySpatialUnit>()
  const active = new Map<number, ReplaySpatialUnit>()
  let observationCount = 0
  let positionCount = 0
  let previousLoop = 0
  const scale = tracker.baseBuild < 27950 ? 4 : 1
  for (const event of tracker.events.slice(0, MAX_EVENTS)) {
    const loop = event.gameLoop
    if (!integer(loop) || loop < previousLoop) {
      diagnose('malformed-event', integer(loop) ? loop : null)
      continue
    }
    previousLoop = loop
    result.durationGameLoops = Math.max(result.durationGameLoops, loop)
    const name = event.eventType.split('.').at(-1) ?? ''
    const kind = kinds[name]
    if (!kind) {
      if (name.startsWith('SUnit')) diagnose('unsupported-event', loop)
      continue
    }
    const data = event.data
    const append = (unit: ReplaySpatialUnit, observation: ReplaySpatialObservation) => {
      if (observationCount >= MAX_OBSERVATIONS) {
        diagnose('budget-exceeded', loop)
        return false
      }
      unit.observations.push(observation)
      observationCount++
      return true
    }
    const position = (observation: ReplaySpatialObservation, x: unknown, y: unknown) => {
      if (
        !integer(x) ||
        !integer(y) ||
        !Number.isSafeInteger(x * scale) ||
        !Number.isSafeInteger(y * scale)
      ) {
        diagnose('malformed-event', loop)
        return false
      }
      observation.x = x * scale
      observation.y = y * scale
      observation.positionGameLoop = loop
      return true
    }
    if (kind === 'position') {
      const items = data.m_items
      let index = data.m_firstUnitIndex
      if (!integer(index) || !Array.isArray(items) || items.length % 3 !== 0) {
        diagnose('malformed-event', loop)
        continue
      }
      for (let i = 0; i < items.length; i += 3) {
        if (positionCount++ >= MAX_OBSERVATIONS || observationCount >= MAX_OBSERVATIONS) {
          diagnose('budget-exceeded', loop)
          break
        }
        const delta = items[i]
        if (!integer(delta) || !Number.isSafeInteger(index + delta)) {
          diagnose('malformed-event', loop)
          break
        }
        index += delta
        const unit = active.get(index)
        if (!unit) {
          diagnose('unknown-unit', loop)
          continue
        }
        const observation = {
          ...unit.observations[unit.observations.length - 1]!,
          gameLoop: loop,
          kind,
        }
        if (position(observation, items[i + 1], items[i + 2])) append(unit, observation)
      }
      continue
    }
    const index = data.m_unitTagIndex
    const recycle = data.m_unitTagRecycle
    if (!integer(index) || !integer(recycle)) {
      diagnose('malformed-event', loop)
      continue
    }
    const tag = `${index}:${recycle}`
    let unit = byTag.get(tag)
    if (kind === 'born' || kind === 'init') {
      if (unit || active.has(index)) {
        diagnose('duplicate-unit', loop)
        continue
      }
      if (result.units.length >= MAX_UNITS || observationCount >= MAX_OBSERVATIONS) {
        diagnose('budget-exceeded', loop)
        continue
      }
      unit = {
        unitTag: tag,
        unitTagIndex: index,
        unitTagRecycle: recycle,
        startedGameLoop: loop,
        diedGameLoop: null,
        observations: [],
      }
      byTag.set(tag, unit)
      active.set(index, unit)
      result.units.push(unit)
    }
    if (!unit) {
      diagnose('unknown-unit', loop)
      continue
    }
    if (unit.diedGameLoop !== null) {
      diagnose('terminal-unit', loop)
      continue
    }
    const last = unit.observations.at(-1)
    const observation: ReplaySpatialObservation = {
      unitType: null,
      controlPlayerId: null,
      upkeepPlayerId: null,
      x: null,
      y: null,
      positionGameLoop: null,
      completed: false,
      ...last,
      gameLoop: loop,
      kind,
    }
    if (kind === 'born' || kind === 'init' || kind === 'type-change') {
      const type = data.m_unitTypeName
      const text =
        typeof type === 'string'
          ? type
          : type && typeof type === 'object' && 'text' in type
            ? type.text
            : null
      if (typeof text === 'string' && text.length > 0 && text.length <= 256)
        observation.unitType = text
      else diagnose('malformed-event', loop)
    }
    if (kind === 'born' || kind === 'init' || kind === 'owner-change') {
      for (const [key, field] of [
        ['controlPlayerId', 'm_controlPlayerId'],
        ['upkeepPlayerId', 'm_upkeepPlayerId'],
      ] as const) {
        if (integer(data[field])) observation[key] = data[field]
        else diagnose('malformed-event', loop)
      }
    }
    if (kind === 'born' || kind === 'init' || kind === 'died')
      position(observation, data.m_x, data.m_y)
    if (kind === 'born' || kind === 'done') observation.completed = true
    if (!append(unit, observation)) break
    if (kind === 'died') {
      unit.diedGameLoop = loop
      active.delete(index)
    }
  }
  return result
}
