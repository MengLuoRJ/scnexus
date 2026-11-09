import { createIndexedSpatialSampler, sampleObservedUnit } from './spatial-sampler.js'

export { createReplayObserverEventIndex, queryReplayObserverEvents } from './events.js'
export type {
  ReplayObserverEventFilter,
  ReplayObserverEventQuery,
  ReplayObserverEventPage,
  ReplayObserverEventIndex,
} from './events.js'
export { sampleReplayObserverAnalysis } from './analysis.js'
export type {
  ReplayObserverAnalysisInput,
  ReplayObserverEconomySample,
  ReplayObserverPlayerAnalysis,
  ReplayObserverProductionEvent,
} from './analysis.js'

/** Structural subset of replay-parser's cumulative spatial timeline. */
export interface ReplayObserverTimeline {
  readonly durationGameLoops: number
  readonly units: readonly {
    readonly unitTag: string
    readonly startedGameLoop: number
    readonly diedGameLoop: number | null
    readonly observations: readonly {
      readonly gameLoop: number
      readonly kind?:
        | 'born'
        | 'init'
        | 'done'
        | 'died'
        | 'owner-change'
        | 'type-change'
        | 'position'
      readonly unitType: string | null
      readonly controlPlayerId: number | null
      readonly upkeepPlayerId: number | null
      readonly completed: boolean
      readonly x: number | null
      readonly y: number | null
      readonly positionGameLoop: number | null
    }[]
  }[]
}

export interface ReplayObserverUnit {
  readonly unitTag: string
  readonly alive: boolean
  readonly completed: boolean
  readonly unitType: string | null
  readonly controlPlayerId: number | null
  readonly upkeepPlayerId: number | null
  readonly position: Readonly<{
    x: number
    y: number
    observedGameLoop: number
    ageGameLoops: number
  }> | null
}

export interface ReplayObserverPlayerUnitSummary {
  readonly playerId: number | null
  readonly alive: number
  readonly dead: number
  readonly underConstruction: number
}

/** Counts recorded entities by their sampled controller, in first-seen player order. */
export function summarizeReplayObserverUnits(
  units: readonly ReplayObserverUnit[],
): readonly ReplayObserverPlayerUnitSummary[] {
  const players = new Map<
    number | null,
    { playerId: number | null; alive: number; dead: number; underConstruction: number }
  >()
  for (const unit of units) {
    let player = players.get(unit.controlPlayerId)
    if (!player) {
      player = { playerId: unit.controlPlayerId, alive: 0, dead: 0, underConstruction: 0 }
      players.set(unit.controlPlayerId, player)
    }
    if (unit.alive) {
      player.alive++
      if (!unit.completed) player.underConstruction++
    } else player.dead++
  }
  return Object.freeze(Array.from(players.values(), (player) => Object.freeze(player)))
}

export interface ReplayObserverUnitFilter {
  readonly playerId?: number | null
  readonly search?: string
  readonly alive?: 'all' | 'alive' | 'dead'
}

export interface ReplayObserverEvent {
  readonly unitTag: string
  readonly gameLoop: number
  readonly kind: 'born' | 'init' | 'done' | 'died' | 'type' | 'owner'
}

/** Filters sampled units, retaining their input order and historical state. */
export function filterReplayObserverUnits(
  units: readonly ReplayObserverUnit[],
  filter: ReplayObserverUnitFilter,
): readonly ReplayObserverUnit[] {
  const search = filter.search?.trim().toLowerCase() ?? ''
  return Object.freeze(
    units.filter(
      (unit) =>
        (filter.playerId === undefined || unit.controlPlayerId === filter.playerId) &&
        (!filter.alive || filter.alive === 'all' || unit.alive === (filter.alive === 'alive')) &&
        (!search ||
          unit.unitTag.toLowerCase().includes(search) ||
          (unit.unitType?.toLowerCase().includes(search) ?? false)),
    ),
  )
}

export interface ReplayObserverState {
  readonly currentGameLoop: number
  readonly duration: number
  readonly playing: boolean
  readonly speed: number
  readonly selectedUnitTag: string | null
  readonly selectedUnit: ReplayObserverUnit | null
  readonly units: readonly ReplayObserverUnit[]
}

export interface ReplayObserver {
  getState(): ReplayObserverState
  seek(gameLoop: number): ReplayObserverState
  advance(deltaLoops: number): ReplayObserverState
  play(): ReplayObserverState
  pause(): ReplayObserverState
  setSpeed(speed: number): ReplayObserverState
  selectUnit(unitTag: string | null): ReplayObserverState
  subscribe(listener: (state: ReplayObserverState) => void): () => void
  dispose(): void
}

function nonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${name} must be finite and nonnegative`)
}

/** Samples only observations at or before the requested loop; never interpolates. */
export function sampleReplaySpatialTimeline(
  timeline: ReplayObserverTimeline,
  gameLoop: number,
): readonly ReplayObserverUnit[] {
  nonnegative(timeline.durationGameLoops, 'durationGameLoops')
  if (!Number.isFinite(gameLoop)) throw new RangeError('gameLoop must be finite')
  const loop = Math.max(0, Math.min(gameLoop, timeline.durationGameLoops))
  const units: ReplayObserverUnit[] = []
  for (const unit of timeline.units) {
    if (unit.startedGameLoop > loop) continue
    let low = 0
    let high = unit.observations.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (unit.observations[middle]!.gameLoop <= loop) low = middle + 1
      else high = middle
    }
    const latest = unit.observations[low - 1]
    if (!latest) continue
    units.push(sampleObservedUnit(unit, latest, loop))
  }
  return Object.freeze(units)
}

/** Pure externally-clocked observer. Input is snapshotted; published states are immutable. */
export function createReplayObserver(input: ReplayObserverTimeline): ReplayObserver {
  nonnegative(input.durationGameLoops, 'durationGameLoops')
  const tags = new Set<string>()
  const timeline: ReplayObserverTimeline = {
    durationGameLoops: input.durationGameLoops,
    units: input.units.map((unit) => {
      if (!unit.unitTag || tags.has(unit.unitTag))
        throw new TypeError('Unit tags must be unique and nonempty')
      tags.add(unit.unitTag)
      nonnegative(unit.startedGameLoop, 'startedGameLoop')
      if (unit.diedGameLoop !== null) {
        nonnegative(unit.diedGameLoop, 'diedGameLoop')
        if (unit.diedGameLoop < unit.startedGameLoop) throw new RangeError('Death precedes start')
      }
      let previous = unit.startedGameLoop
      const observations = unit.observations.map((observation) => {
        nonnegative(observation.gameLoop, 'observation.gameLoop')
        if (observation.gameLoop < previous)
          throw new RangeError('Observations must be chronological')
        previous = observation.gameLoop
        if (
          (observation.x === null) !== (observation.y === null) ||
          (observation.x === null) !== (observation.positionGameLoop === null)
        ) {
          throw new TypeError('Position coordinates and loop must be present together')
        }
        if (observation.positionGameLoop !== null) {
          nonnegative(observation.positionGameLoop, 'positionGameLoop')
          if (
            observation.positionGameLoop > observation.gameLoop ||
            !Number.isFinite(observation.x) ||
            !Number.isFinite(observation.y)
          ) {
            throw new RangeError('Invalid observed position')
          }
        }
        return { ...observation }
      })
      return { ...unit, observations }
    }),
  }
  const sampler = createIndexedSpatialSampler(timeline)
  let disposed = false
  const listeners = new Set<(state: ReplayObserverState) => void>()
  let state: ReplayObserverState = Object.freeze({
    currentGameLoop: 0,
    duration: timeline.durationGameLoops,
    playing: false,
    speed: 1,
    selectedUnitTag: null,
    selectedUnit: null,
    units: sampler.sample(0),
  })
  function assertActive(): void {
    if (disposed) throw new Error('Replay observer is disposed')
  }
  function update(patch: Partial<ReplayObserverState>): ReplayObserverState {
    assertActive()
    const next = { ...state, ...patch }
    if (next.currentGameLoop >= next.duration) next.playing = false
    if (next.currentGameLoop !== state.currentGameLoop)
      next.units = sampler.sample(next.currentGameLoop)
    next.selectedUnit =
      next.selectedUnitTag === null
        ? null
        : (next.units.find((unit) => unit.unitTag === next.selectedUnitTag) ?? null)
    state = Object.freeze(next)
    const published = state
    const pendingListeners = [...listeners]
    for (const listener of pendingListeners) {
      if (disposed) break
      if (listeners.has(listener)) listener(published)
    }
    return state
  }
  return {
    getState: () => state,
    seek(gameLoop) {
      assertActive()
      if (!Number.isFinite(gameLoop)) throw new RangeError('gameLoop must be finite')
      return update({ currentGameLoop: Math.max(0, Math.min(gameLoop, state.duration)) })
    },
    advance(deltaLoops) {
      assertActive()
      nonnegative(deltaLoops, 'deltaLoops')
      if (!state.playing || deltaLoops === 0) return state
      return update({
        currentGameLoop: Math.min(state.duration, state.currentGameLoop + deltaLoops * state.speed),
      })
    },
    play: () => update({ playing: true }),
    pause: () => update({ playing: false }),
    setSpeed(speed) {
      assertActive()
      if (!Number.isFinite(speed) || speed <= 0)
        throw new RangeError('speed must be finite and positive')
      return update({ speed })
    },
    selectUnit(unitTag) {
      assertActive()
      if (unitTag !== null && !tags.has(unitTag)) throw new RangeError('Unknown unit tag')
      return update({ selectedUnitTag: unitTag })
    },
    subscribe(listener) {
      assertActive()
      if (typeof listener !== 'function') throw new TypeError('listener must be a function')
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      disposed = true
      listeners.clear()
      sampler.dispose()
      tags.clear()
    },
  }
}
