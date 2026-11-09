import type { ReplayObserverTimeline } from './index.js'

function nonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${name} must be finite and nonnegative`)
}

export function snapshotReplayObserverTimeline(
  input: ReplayObserverTimeline,
): ReplayObserverTimeline {
  nonnegative(input.durationGameLoops, 'durationGameLoops')
  const tags = new Set<string>()
  return {
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
        )
          throw new TypeError('Position coordinates and loop must be present together')
        if (observation.positionGameLoop !== null) {
          nonnegative(observation.positionGameLoop, 'positionGameLoop')
          if (
            observation.positionGameLoop > observation.gameLoop ||
            !Number.isFinite(observation.x) ||
            !Number.isFinite(observation.y)
          )
            throw new RangeError('Invalid observed position')
        }
        return { ...observation }
      })
      return { ...unit, observations }
    }),
  }
}
