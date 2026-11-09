import { snapshotReplayObserverTimeline } from './timeline.js'
import type { ReplayObserverDataSource, ReplayObserverWindow } from './async-observer.js'
import type { ReplayObserverTimeline } from './index.js'

export interface ReplayObserverTimelineSource extends ReplayObserverDataSource {
  dispose(): void
}

/** In-memory bridge for existing complete parser timelines, not a file cache. */
export function createReplayObserverTimelineSource(
  input: ReplayObserverTimeline,
  windowGameLoops = 1600,
): ReplayObserverTimelineSource {
  if (!Number.isSafeInteger(windowGameLoops) || windowGameLoops <= 0)
    throw new RangeError('windowGameLoops must be a positive safe integer')
  let timeline: ReplayObserverTimeline | null = snapshotReplayObserverTimeline(input)
  const durationGameLoops = timeline.durationGameLoops
  return {
    durationGameLoops,
    async loadWindow(gameLoop, signal): Promise<ReplayObserverWindow> {
      signal.throwIfAborted()
      await Promise.resolve()
      signal.throwIfAborted()
      if (!timeline) throw new Error('Replay timeline source is disposed')
      if (!Number.isFinite(gameLoop) || gameLoop < 0 || gameLoop > durationGameLoops)
        throw new RangeError('Requested loop must be inside the replay duration')
      const fromGameLoop = Math.min(
        gameLoop,
        Math.floor(gameLoop / windowGameLoops) * windowGameLoops,
      )
      const toGameLoop = Math.min(durationGameLoops, fromGameLoop + windowGameLoops)
      const units: ReplayObserverTimeline['units'][number][] = []
      for (const unit of timeline.units) {
        if (unit.startedGameLoop > toGameLoop) continue
        let low = 0
        let high = unit.observations.length
        while (low < high) {
          const middle = Math.floor((low + high) / 2)
          if (unit.observations[middle]!.gameLoop <= fromGameLoop) low = middle + 1
          else high = middle
        }
        const observations: ReplayObserverTimeline['units'][number]['observations'][number][] = []
        const previous = unit.observations[low - 1]
        if (previous)
          observations.push(
            Object.freeze({ ...previous, gameLoop: fromGameLoop, kind: 'position' }),
          )
        for (let index = low; index < unit.observations.length; index++) {
          const observation = unit.observations[index]!
          if (observation.gameLoop > toGameLoop) break
          observations.push(Object.freeze({ ...observation }))
        }
        units.push(Object.freeze({ ...unit, observations: Object.freeze(observations) }))
      }
      return Object.freeze({
        fromGameLoop,
        toGameLoop,
        timeline: Object.freeze({ durationGameLoops, units: Object.freeze(units) }),
      })
    },
    dispose() {
      timeline = null
    },
  }
}
