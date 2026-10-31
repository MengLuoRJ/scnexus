import { expect, test } from 'vitest'
import type { ReplayEconomySample } from '@scnexus/app-shared/types/replay-insights.type'
import { comparisonEconomyChart, economyChart, replayGameTime } from '../insights'

function sample(gameLoop: number, minerals: number | null): ReplayEconomySample {
  return {
    gameLoop,
    minerals,
    vespene: null,
    mineralIncome: null,
    vespeneIncome: null,
    workers: null,
    supplyUsed: null,
    supplyCap: null,
    armyMinerals: null,
    armyVespene: null,
  }
}

test('charts actual fields, ordered duplicates and null gaps without zero substitution', () => {
  const chart = economyChart(
    [sample(480, 25), sample(160, 50), sample(320, null), sample(160, 75)],
    ['minerals', 'workers'],
  )
  expect(chart.series[0]!.segments.map((segment) => segment.map((point) => point.value))).toEqual([
    [50, 75],
    [25],
  ])
  expect(chart.series[0]!.segments[0]![0]!.x).toBe(chart.series[0]!.segments[0]![1]!.x)
  expect(chart.series[1]!.segments).toEqual([])
  expect(replayGameTime(16 * 125 + 15)).toBe('2:05')
  expect(economyChart([], ['minerals']).series[0]!.segments).toEqual([])
})

test('large histories have bounded actual display samples, full extent and endpoints, and retained gaps', () => {
  const samples = Array.from({ length: 100_000 }, (_, index) =>
    sample(index * 16, index === 500 ? null : index),
  )
  const chart = economyChart(samples, ['minerals'])
  const points = chart.series[0]!.segments.flat()
  expect(points.length).toBeLessThanOrEqual(1000)
  expect(points[0]!.value).toBe(0)
  expect(points.at(-1)!.value).toBe(99_999)
  expect(chart.max).toBe(99_999)
  expect(chart.end).toBe(99_999 * 16)
  expect(chart.series[0]!.segments).toHaveLength(2)
  expect(
    points.every((point) =>
      samples.some(
        (sample) => sample.gameLoop === point.gameLoop && sample.minerals === point.value,
      ),
    ),
  ).toBe(true)
})

test('compares all players on global axes without aligning or filling independent histories', () => {
  const players = [
    {
      playerId: 1,
      label: 'Same (#1)',
      samples: [sample(160, 50), sample(320, null), sample(480, 25)],
    },
    { playerId: 2, label: 'Same (#2)', samples: [sample(240, 50), sample(960, 200)] },
  ]
  const chart = comparisonEconomyChart(players, ['minerals', 'workers'])
  expect(chart.max).toBe(200)
  expect(chart.end).toBe(960)
  const first = chart.series[0]!
  const second = chart.series[2]!
  expect(first.segments).toHaveLength(2)
  expect(first.segments.flat().map((point) => point.gameLoop)).toEqual([160, 480])
  expect(second.segments.flat().map((point) => point.gameLoop)).toEqual([240, 960])
  expect(first.segments[0]![0]!.y).toBe(second.segments[0]![0]!.y)
  expect(first.segments.at(-1)!.at(-1)!.x).toBe(300)
  expect(second.segments.at(-1)!.at(-1)!.x).toBe(552)
  expect(first.color).not.toBe(second.color)
  expect(first.dash).toBe(second.dash)
  expect(first.dash).not.toBe(chart.series[1]!.dash)
  expect(chart.series[1]!.segments).toEqual([])
  expect(comparisonEconomyChart([...players].reverse(), ['minerals']).series[0]!.color).toBe(
    second.color,
  )
})

test('comparison series keep per-player bounds and use full-history maxima', () => {
  const samples = Array.from({ length: 10_000 }, (_, index) =>
    sample(index * 16, index === 25 ? 50_000 : index),
  )
  const chart = comparisonEconomyChart(
    [
      { playerId: 1, label: 'One', samples },
      { playerId: 2, label: 'Two', samples: [sample(80, 30)] },
    ],
    ['minerals'],
  )
  expect(chart.max).toBe(50_000)
  expect(chart.series[0]!.segments.flat().length).toBeLessThanOrEqual(1000)
  expect(chart.series[1]!.segments.flat()).toHaveLength(1)
  expect(chart.series[1]!.segments[0]![0]!.gameLoop).toBe(80)
})
