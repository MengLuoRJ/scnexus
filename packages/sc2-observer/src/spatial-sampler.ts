import type { ReplayObserverTimeline, ReplayObserverUnit } from './index.js'

type TimelineUnit = ReplayObserverTimeline['units'][number]
type Observation = TimelineUnit['observations'][number]

export function sampleObservedUnit(
  unit: TimelineUnit,
  latest: Observation,
  loop: number,
): ReplayObserverUnit {
  const position =
    latest.x !== null && latest.y !== null && latest.positionGameLoop !== null
      ? Object.freeze({
          x: latest.x,
          y: latest.y,
          observedGameLoop: latest.positionGameLoop,
          ageGameLoops: loop - latest.positionGameLoop,
        })
      : null
  return Object.freeze({
    unitTag: unit.unitTag,
    alive: unit.diedGameLoop === null || unit.diedGameLoop > loop,
    completed: latest.completed,
    unitType: latest.unitType,
    controlPlayerId: latest.controlPlayerId,
    upkeepPlayerId: latest.upkeepPlayerId,
    position,
  })
}

/** Private cache over the observer's validated, owned timeline. */
export function createIndexedSpatialSampler(timeline: ReplayObserverTimeline) {
  const entries = timeline.units.map((unit) => ({
    unit,
    latest: undefined as Observation | undefined,
    lowerLoop: -1,
    upperLoop: 0,
  }))
  const starts = [...new Set(entries.map(({ unit }) => unit.startedGameLoop))].sort((a, b) => a - b)
  let candidates: typeof entries = []
  let lowerBirth = -1
  let upperBirth = 0
  return {
    sample(loop: number): readonly ReplayObserverUnit[] {
      if (loop < lowerBirth || loop >= upperBirth) {
        let low = 0
        let high = starts.length
        while (low < high) {
          const middle = Math.floor((low + high) / 2)
          if (starts[middle]! <= loop) low = middle + 1
          else high = middle
        }
        lowerBirth = starts[low - 1] ?? -1
        upperBirth = starts[low] ?? Infinity
        candidates = entries.filter(({ unit }) => unit.startedGameLoop <= loop)
      }
      const units: ReplayObserverUnit[] = []
      for (const entry of candidates) {
        const observations = entry.unit.observations
        if (loop < entry.lowerLoop || loop >= entry.upperLoop) {
          let low = 0
          let high = observations.length
          while (low < high) {
            const middle = Math.floor((low + high) / 2)
            if (observations[middle]!.gameLoop <= loop) low = middle + 1
            else high = middle
          }
          entry.latest = observations[low - 1]
          entry.lowerLoop = entry.latest?.gameLoop ?? -1
          entry.upperLoop = observations[low]?.gameLoop ?? Infinity
        }
        if (entry.latest) units.push(sampleObservedUnit(entry.unit, entry.latest, loop))
      }
      return Object.freeze(units)
    },
    dispose(): void {
      entries.length = 0
      starts.length = 0
      candidates = []
    },
  }
}
