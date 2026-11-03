import type { ReplayEconomySample } from '@scnexus/app-shared/types/replay-insights.type'

export type EconomyMetric = Exclude<keyof ReplayEconomySample, 'gameLoop'>

type ScoreChartGroup = {
  key: string
  basis: 'stock' | 'cumulative' | 'rate' | 'population'
  sections: { key: string; metrics: EconomyMetric[] }[]
}

export const scoreChartGroups: ScoreChartGroup[] = [
  {
    key: 'resources',
    basis: 'stock',
    sections: [{ key: 'all', metrics: ['minerals', 'vespene'] }],
  },
  {
    key: 'income',
    basis: 'rate',
    sections: [{ key: 'all', metrics: ['mineralIncome', 'vespeneIncome'] }],
  },
  {
    key: 'workersSupply',
    basis: 'population',
    sections: [{ key: 'all', metrics: ['workers', 'supplyUsed', 'supplyCap'] }],
  },
  {
    key: 'armyValue',
    basis: 'stock',
    sections: [
      { key: 'army', metrics: ['armyMinerals', 'armyVespene'] },
      { key: 'economy', metrics: ['economyMinerals', 'economyVespene'] },
      { key: 'technology', metrics: ['technologyMinerals', 'technologyVespene'] },
    ],
  },
  {
    key: 'inProgress',
    basis: 'stock',
    sections: [
      { key: 'army', metrics: ['inProgressArmyMinerals', 'inProgressArmyVespene'] },
      { key: 'economy', metrics: ['inProgressEconomyMinerals', 'inProgressEconomyVespene'] },
      {
        key: 'technology',
        metrics: ['inProgressTechnologyMinerals', 'inProgressTechnologyVespene'],
      },
    ],
  },
  {
    key: 'active',
    basis: 'stock',
    sections: [{ key: 'army', metrics: ['activeForcesMinerals', 'activeForcesVespene'] }],
  },
  {
    key: 'lost',
    basis: 'cumulative',
    sections: [
      { key: 'army', metrics: ['lostArmyMinerals', 'lostArmyVespene'] },
      { key: 'economy', metrics: ['lostEconomyMinerals', 'lostEconomyVespene'] },
      { key: 'technology', metrics: ['lostTechnologyMinerals', 'lostTechnologyVespene'] },
    ],
  },
  {
    key: 'killed',
    basis: 'cumulative',
    sections: [
      { key: 'army', metrics: ['killedArmyMinerals', 'killedArmyVespene'] },
      { key: 'economy', metrics: ['killedEconomyMinerals', 'killedEconomyVespene'] },
      { key: 'technology', metrics: ['killedTechnologyMinerals', 'killedTechnologyVespene'] },
    ],
  },
  {
    key: 'friendlyFire',
    basis: 'cumulative',
    sections: [
      { key: 'army', metrics: ['friendlyFireArmyMinerals', 'friendlyFireArmyVespene'] },
      { key: 'economy', metrics: ['friendlyFireEconomyMinerals', 'friendlyFireEconomyVespene'] },
      {
        key: 'technology',
        metrics: ['friendlyFireTechnologyMinerals', 'friendlyFireTechnologyVespene'],
      },
    ],
  },
]

export function replayGameTime(gameLoop: number): string {
  const seconds = Math.floor(gameLoop / 16)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export type EconomyChartPlayer = {
  playerId: number
  label: string
  samples: ReplayEconomySample[]
}

export function comparisonEconomyChart(players: EconomyChartPlayer[], metrics: EconomyMetric[]) {
  const scale = { end: 16, min: 0, max: 1 }
  for (const player of players) {
    for (const sample of player.samples) {
      if (!Number.isFinite(sample.gameLoop) || sample.gameLoop < 0) continue
      scale.end = Math.max(scale.end, sample.gameLoop)
      for (const metric of metrics) {
        const value = sample[metric]
        if (typeof value === 'number' && Number.isFinite(value)) {
          scale.min = Math.min(scale.min, value)
          scale.max = Math.max(scale.max, value)
        }
      }
    }
  }
  return {
    ...scale,
    series: players.flatMap((player) =>
      economyChart(player.samples, metrics, scale).series.map((series, metricIndex) => ({
        ...series,
        playerId: player.playerId,
        label: player.label,
        // Derive distinct player hues from the theme's semantic primary color.
        color: `oklch(from var(--ui-primary) l c ${((player.playerId - 1) * 137.508) % 360})`,
        dash: ['', '6 3', '2 3'][metricIndex % 3],
      })),
    ),
  }
}

export function economyChart(
  samples: ReplayEconomySample[],
  metrics: EconomyMetric[],
  scale?: { end: number; min?: number; max: number },
) {
  const ordered = samples
    .filter((sample) => Number.isFinite(sample.gameLoop) && sample.gameLoop >= 0)
    .sort((a, b) => a.gameLoop - b.gameLoop)
  const end =
    scale?.end ?? ordered.reduce((maximum, sample) => Math.max(maximum, sample.gameLoop), 16)
  const max =
    scale?.max ??
    ordered.reduce(
      (maximum, sample) =>
        metrics.reduce((value, metric) => {
          const current = sample[metric]
          return typeof current === 'number' && Number.isFinite(current)
            ? Math.max(value, current)
            : value
        }, maximum),
      1,
    )
  const min =
    scale?.min ??
    ordered.reduce(
      (minimum, sample) =>
        metrics.reduce((value, metric) => {
          const current = sample[metric]
          return typeof current === 'number' && Number.isFinite(current)
            ? Math.min(value, current)
            : value
        }, minimum),
      0,
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
    min,
    max,
    series: metrics.map((metric) => {
      const data: { gameLoop: number; value: number | null }[] = []
      const segments: { gameLoop: number; value: number }[][] = []
      let segment: (typeof segments)[number] = []
      for (const bucket of buckets) {
        const sample = bucket[bucket.length - 1]!
        const value = sample[metric]
        // A missing value anywhere in a display bucket must still break the curve.
        if (
          typeof value !== 'number' ||
          bucket.some((item) => item[metric] === null || !Number.isFinite(item[metric]))
        ) {
          data.push({ gameLoop: sample.gameLoop, value: null })
          if (segment.length) segments.push(segment)
          segment = []
        } else {
          const point = { gameLoop: sample.gameLoop, value }
          data.push(point)
          segment.push(point)
        }
      }
      if (segment.length) segments.push(segment)
      return { metric, segments, data }
    }),
  }
}
