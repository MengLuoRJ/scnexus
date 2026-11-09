import type { ReplayObserverEvent, ReplayObserverTimeline } from './index.js'

export interface ReplayObserverEventFilter {
  readonly unitTag?: string
  readonly kind?: ReplayObserverEvent['kind']
  readonly fromGameLoop?: number
  readonly toGameLoop?: number
}

export interface ReplayObserverEventQuery extends ReplayObserverEventFilter {
  readonly offset?: number
  readonly limit?: number
  readonly order?: 'asc' | 'desc'
}

export interface ReplayObserverEventPage {
  readonly total: number
  readonly events: readonly ReplayObserverEvent[]
}

export interface ReplayObserverEventIndex {
  query(query?: ReplayObserverEventQuery): ReplayObserverEventPage
  previous(gameLoop: number, filter?: ReplayObserverEventFilter): ReplayObserverEvent | null
  next(gameLoop: number, filter?: ReplayObserverEventFilter): ReplayObserverEvent | null
  dispose(): void
}

/** Queries observed lifecycle transitions, excluding sparse position updates. */
export function queryReplayObserverEvents(
  timeline: ReplayObserverTimeline,
  unitTag?: string,
): readonly ReplayObserverEvent[] {
  const events: ReplayObserverEvent[] = []
  for (const unit of timeline.units) {
    if (unitTag !== undefined && unit.unitTag !== unitTag) continue
    let previous: (typeof unit.observations)[number] | undefined
    let deathRecorded = false
    const append = (gameLoop: number, kind: ReplayObserverEvent['kind']) => {
      if (kind === 'died') {
        if (deathRecorded) return
        deathRecorded = true
      }
      events.push(Object.freeze({ unitTag: unit.unitTag, gameLoop, kind }))
    }
    for (const observation of unit.observations) {
      if (observation.kind !== undefined) {
        if (observation.kind !== 'position') {
          const kind =
            observation.kind === 'type-change'
              ? 'type'
              : observation.kind === 'owner-change'
                ? 'owner'
                : observation.kind
          append(observation.gameLoop, kind)
        }
      } else if (previous) {
        if (!previous.completed && observation.completed) append(observation.gameLoop, 'done')
        if (previous.unitType !== observation.unitType) append(observation.gameLoop, 'type')
        if (
          previous.controlPlayerId !== observation.controlPlayerId ||
          previous.upkeepPlayerId !== observation.upkeepPlayerId
        )
          append(observation.gameLoop, 'owner')
      } else if (observation.gameLoop === unit.startedGameLoop) {
        append(observation.gameLoop, observation.completed ? 'born' : 'init')
      }
      previous = observation
    }
    if (unit.diedGameLoop !== null) append(unit.diedGameLoop, 'died')
  }
  return Object.freeze(events.sort((a, b) => a.gameLoop - b.gameLoop))
}

function loopArgument(value: number): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError('Event game loops must be finite and nonnegative')
}

/** First event >= loop, or > loop when exclusive. */
function boundary(events: readonly ReplayObserverEvent[], loop: number, exclusive = false): number {
  let low = 0
  let high = events.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (events[middle]!.gameLoop < loop || (exclusive && events[middle]!.gameLoop === loop))
      low = middle + 1
    else high = middle
  }
  return low
}

type EventGroup = {
  events: ReplayObserverEvent[]
  kinds: Map<ReplayObserverEvent['kind'], ReplayObserverEvent[]>
}

/** Owns event snapshots and bounded, indexed time queries; no playback clock. */
export function createReplayObserverEventIndex(
  timeline: ReplayObserverTimeline,
): ReplayObserverEventIndex {
  const all: EventGroup = { events: [], kinds: new Map() }
  const units = new Map<string, EventGroup>()
  const append = (group: EventGroup, event: ReplayObserverEvent) => {
    group.events.push(event)
    const kind = group.kinds.get(event.kind)
    if (kind) kind.push(event)
    else group.kinds.set(event.kind, [event])
  }
  for (const event of queryReplayObserverEvents(timeline)) {
    loopArgument(event.gameLoop)
    append(all, event)
    let unit = units.get(event.unitTag)
    if (!unit) {
      unit = { events: [], kinds: new Map() }
      units.set(event.unitTag, unit)
    }
    append(unit, event)
  }
  let disposed = false
  function range(filter: ReplayObserverEventFilter) {
    if (disposed) throw new Error('Replay observer event index is disposed')
    if (filter.fromGameLoop !== undefined) loopArgument(filter.fromGameLoop)
    if (filter.toGameLoop !== undefined) loopArgument(filter.toGameLoop)
    const from = filter.fromGameLoop ?? 0
    const to = filter.toGameLoop ?? Infinity
    if (from > to) throw new RangeError('Event time range is reversed')
    const group = filter.unitTag === undefined ? all : units.get(filter.unitTag)
    const events = (filter.kind === undefined ? group?.events : group?.kinds.get(filter.kind)) ?? []
    return { events, start: boundary(events, from), end: boundary(events, to, true) }
  }
  return {
    query(query = {}) {
      const { events, start, end } = range(query)
      const offset = query.offset ?? 0
      const limit = query.limit ?? 100
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new RangeError('Event offset must be a nonnegative safe integer')
      if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1000)
        throw new RangeError('Event limit must be an integer between 0 and 1000')
      if (query.order !== undefined && query.order !== 'asc' && query.order !== 'desc')
        throw new RangeError('Unknown event order')
      const total = end - start
      const page: ReplayObserverEvent[] = []
      const count = Math.min(limit, Math.max(0, total - offset))
      for (let index = 0; index < count; index++)
        page.push(
          events[query.order === 'desc' ? end - 1 - offset - index : start + offset + index]!,
        )
      return Object.freeze({ total, events: Object.freeze(page) })
    },
    previous(gameLoop, filter = {}) {
      loopArgument(gameLoop)
      const { events, start, end } = range(filter)
      const index = Math.min(end, boundary(events, gameLoop)) - 1
      return index >= start ? events[index]! : null
    },
    next(gameLoop, filter = {}) {
      loopArgument(gameLoop)
      const { events, start, end } = range(filter)
      const index = Math.max(start, boundary(events, gameLoop, true))
      return index < end ? events[index]! : null
    },
    dispose() {
      disposed = true
      all.events.length = 0
      all.kinds.clear()
      units.clear()
    },
  }
}
