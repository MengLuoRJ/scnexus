import type { ReplayEconomySample } from '@scnexus/app-shared/types/replay-insights.type'
import type { EconomyChartPlayer, EconomyMetric } from './insights'

export const summaryMetrics = [
  'mineralIncome',
  'vespeneIncome',
  'minerals',
  'vespene',
  'armyMinerals',
  'armyVespene',
  'lostArmyMinerals',
  'lostArmyVespene',
  'killedArmyMinerals',
  'killedArmyVespene',
] as const satisfies EconomyMetric[]

type SummaryValues = Record<(typeof summaryMetrics)[number], number | null>
export type SummarySnapshot = {
  gameLoop: number
  values: SummaryValues
  exchange: { minerals: number | null; vespene: number | null }
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A zero denominator or corrected negative counter does not define an exchange ratio. */
function ratio(killed: number | null, lost: number | null): number | null {
  if (killed === null || lost === null || killed < 0 || lost <= 0) return null
  return finite(killed / lost)
}

function snapshot(sample: ReplayEconomySample): SummarySnapshot {
  const values = Object.fromEntries(
    summaryMetrics.map((metric) => [metric, finite(sample[metric])]),
  ) as SummaryValues
  return {
    gameLoop: sample.gameLoop,
    values,
    exchange: {
      minerals: ratio(values.killedArmyMinerals, values.lostArmyMinerals),
      vespene: ratio(values.killedArmyVespene, values.lostArmyVespene),
    },
  }
}

/** Exact recorded samples only: no interpolation, carry-forward, or backfilling unknown fields. */
export function buildReplaySummary(players: EconomyChartPlayer[]) {
  const histories = players.map((player) => {
    const samples = new Map<number, ReplayEconomySample>()
    for (const sample of player.samples) {
      if (Number.isFinite(sample.gameLoop) && sample.gameLoop >= 0)
        samples.set(sample.gameLoop, sample)
    }
    return { player, samples }
  })
  const commonLoops = [...(histories[0]?.samples.keys() ?? [])].filter((loop) =>
    histories.every(({ samples }) => samples.has(loop)),
  )
  const commonGameLoop =
    histories.length > 1 && commonLoops.length
      ? commonLoops.reduce((latest, loop) => Math.max(latest, loop), 0)
      : null
  const result = histories.map(({ player, samples }) => {
    const lastLoop = samples.size
      ? [...samples.keys()].reduce((latest, loop) => Math.max(latest, loop), 0)
      : null
    return {
      playerId: player.playerId,
      label: player.label,
      final: lastLoop === null ? null : snapshot(samples.get(lastLoop)!),
      common: commonGameLoop === null ? null : snapshot(samples.get(commonGameLoop)!),
    }
  })
  return {
    players: result,
    commonGameLoop,
    simultaneousFinal:
      result.length > 1 &&
      result.every((player) => player.final !== null && player.final.gameLoop === commonGameLoop),
  }
}
