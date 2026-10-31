import type { ReplayEconomySample } from '@scnexus/app-shared/types/replay-insights.type'

export type EconomyMetric = Exclude<keyof ReplayEconomySample, 'gameLoop'>

export function replayGameTime(gameLoop: number): string {
  const seconds = Math.floor(gameLoop / 16)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function economyChart(samples: ReplayEconomySample[], metrics: EconomyMetric[]) {
  const ordered = samples
    .filter((sample) => Number.isFinite(sample.gameLoop) && sample.gameLoop >= 0)
    .sort((a, b) => a.gameLoop - b.gameLoop)
  const end = ordered.reduce((maximum, sample) => Math.max(maximum, sample.gameLoop), 16)
  const max = ordered.reduce(
    (maximum, sample) =>
      metrics.reduce((value, metric) => {
        const current = sample[metric]
        return current !== null && Number.isFinite(current) ? Math.max(value, current) : value
      }, maximum),
    1,
  )
  const stride = Math.ceil(Math.max(0, ordered.length - 2) / 998)
  const buckets =
    ordered.length <= 1000
      ? ordered.map((sample) => [sample])
      : [
          ordered.slice(0, 1),
          ...Array.from({ length: Math.ceil((ordered.length - 2) / stride) }, (_, index) =>
            ordered.slice(
              1 + index * stride,
              Math.min(ordered.length - 1, 1 + (index + 1) * stride),
            ),
          ),
          ordered.slice(-1),
        ]
  return {
    end,
    max,
    series: metrics.map((metric) => {
      const segments: { x: number; y: number; gameLoop: number; value: number }[][] = []
      let segment: (typeof segments)[number] = []
      for (const bucket of buckets) {
        const sample = bucket[bucket.length - 1]!
        const value = sample[metric]
        // A missing value anywhere in a display bucket must still break the curve.
        if (
          value === null ||
          bucket.some((item) => item[metric] === null || !Number.isFinite(item[metric]))
        ) {
          if (segment.length) segments.push(segment)
          segment = []
        } else {
          segment.push({
            x: 48 + (sample.gameLoop / end) * 504,
            y: 150 - (value / max) * 128,
            gameLoop: sample.gameLoop,
            value,
          })
        }
      }
      if (segment.length) segments.push(segment)
      return { metric, segments }
    }),
  }
}
