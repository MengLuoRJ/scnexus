import { expect, test } from 'vitest'
import type { ReplayEconomySample } from '@scnexus/app-shared/types/replay-insights.type'
import { economyChart, replayGameTime } from '../insights'

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
