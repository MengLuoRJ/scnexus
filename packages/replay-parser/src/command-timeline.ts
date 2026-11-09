import type { ReplayGameEvents } from './game-events.js'
import type { ReplaySpatialTimeline, ReplaySpatialUnit } from './spatial-timeline.js'

/** Protocol integers; coordinate conversion is not inferred here. */
export type ReplayCommandPoint = { x: number; y: number; z: number | null }
export type ReplayCommandTarget =
  | { kind: 'unknown' | 'none' }
  | { kind: 'point'; rawPoint: ReplayCommandPoint }
  | { kind: 'data'; value: number }
  | {
      kind: 'unit'
      rawTag: number
      unitTag: string | null
      unitType: string | null
      observedGameLoop: number | null
    }
export type ReplayCommandObservation = {
  gameLoop: number
  userId: number
  abilityLink: number | null
  abilityIndex: number | null
  flags: number
  target: ReplayCommandTarget
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) && !('kind' in value)
    ? (value as Record<string, unknown>)
    : null
}
function unsigned(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 0xffffffff
    ? value
    : null
}
function point(value: unknown): ReplayCommandPoint | null {
  const fields = record(value)
  if (!fields || !Number.isSafeInteger(fields.x) || !Number.isSafeInteger(fields.y)) return null
  return {
    x: fields.x as number,
    y: fields.y as number,
    z: Number.isSafeInteger(fields.z) ? (fields.z as number) : null,
  }
}

/** Targets are recorded intent, never the issuing unit, a completed action or a position observation. */
export function buildReplayCommandTimeline(
  game: ReplayGameEvents,
  spatial?: ReplaySpatialTimeline,
): ReplayCommandObservation[] {
  if (game.events.length > 100_000 || (spatial?.units.length ?? 0) > 50_000)
    throw new RangeError('Replay command timeline limit exceeded')
  const units = new Map<number, ReplaySpatialUnit | null>()
  if (
    game.compatibility?.state === 'verified' &&
    spatial?.baseBuild === game.baseBuild &&
    !spatial?.diagnostics.some((item) =>
      ['duplicate-unit', 'malformed-event', 'budget-exceeded'].includes(item.code),
    )
  ) {
    for (const unit of spatial?.units ?? []) {
      const index = unsigned(unit.unitTagIndex)
      const recycle = unsigned(unit.unitTagRecycle)
      if (index === null || index >= 16384 || recycle === null || recycle >= 262144) continue
      const packed = index * 262144 + recycle
      units.set(packed, units.has(packed) ? null : unit)
    }
  }
  function target(data: Record<string, unknown>, gameLoop: number): ReplayCommandTarget {
    const choice = record(data.m_data)
    if (!choice || Object.keys(choice).length !== 1) return { kind: 'unknown' }
    if (Object.hasOwn(choice, 'None') && choice.None === null) return { kind: 'none' }
    if (Object.hasOwn(choice, 'TargetPoint')) {
      const rawPoint = point(choice.TargetPoint)
      return rawPoint ? { kind: 'point', rawPoint } : { kind: 'unknown' }
    }
    if (Object.hasOwn(choice, 'Data')) {
      const value = unsigned(choice.Data)
      return value === null ? { kind: 'unknown' } : { kind: 'data', value }
    }
    const rawTag = unsigned(record(choice.TargetUnit)?.m_tag)
    if (rawTag === null) return { kind: 'unknown' }
    const result: ReplayCommandTarget = {
      kind: 'unit',
      rawTag,
      unitTag: null,
      unitType: null,
      observedGameLoop: null,
    }
    const unit = units.get(rawTag)
    // Cross-stream ordering at birth/death boundaries is not established by equal game loops.
    if (
      !unit ||
      gameLoop <= unit.startedGameLoop ||
      (unit.diedGameLoop !== null && gameLoop >= unit.diedGameLoop)
    )
      return result
    let low = 0
    let high = unit.observations.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (unit.observations[middle]!.gameLoop < gameLoop) low = middle + 1
      else high = middle
    }
    const observation = unit.observations[low - 1]
    if (observation) {
      result.unitTag = unit.unitTag
      result.unitType = observation.unitType
      result.observedGameLoop = observation.gameLoop
    }
    return result
  }
  return game.events
    .filter((event) => event.eventType === 'NNet.Game.SCmdEvent')
    .map((event) => {
      const ability = Object.hasOwn(event.data, 'm_abil') ? record(event.data.m_abil) : event.data
      return {
        gameLoop: event.gameLoop,
        userId: event.userId,
        abilityLink: unsigned(ability?.m_abilLink),
        abilityIndex: unsigned(ability?.m_abilCmdIndex),
        flags: unsigned(event.data.m_cmdFlags) ?? 0,
        target: target(event.data, event.gameLoop),
      }
    })
}
