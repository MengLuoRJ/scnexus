import type { ReplayObserverTimeline } from '../src/index.js'

export function spatialFixture(
  unitCount: number,
  observationCount: number,
  staggered = true,
): ReplayObserverTimeline {
  return {
    durationGameLoops: (staggered ? Math.max(0, unitCount - 1) * 32 : 0) + observationCount * 64,
    units: Array.from({ length: unitCount }, (_, index) => {
      const startedGameLoop = staggered ? index * 32 : 0
      return {
        unitTag: `${index}:1`,
        startedGameLoop,
        diedGameLoop: null,
        observations: Array.from({ length: observationCount }, (_, sample) => ({
          gameLoop: startedGameLoop + sample * 64,
          unitType: sample < 8 ? 'Marine' : 'Marauder',
          controlPlayerId: (index % 2) + 1,
          upkeepPlayerId: (index % 2) + 1,
          completed: sample > 0,
          x: index + sample,
          y: sample,
          positionGameLoop: startedGameLoop + sample * 64,
        })),
      }
    }),
  }
}
