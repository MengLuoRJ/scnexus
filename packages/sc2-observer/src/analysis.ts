const economyFields = [
  'minerals',
  'vespene',
  'mineralIncome',
  'vespeneIncome',
  'workers',
  'supplyUsed',
  'supplyCap',
  'armyMinerals',
  'armyVespene',
  'economyMinerals',
  'economyVespene',
  'technologyMinerals',
  'technologyVespene',
  'inProgressArmyMinerals',
  'inProgressArmyVespene',
  'inProgressEconomyMinerals',
  'inProgressEconomyVespene',
  'inProgressTechnologyMinerals',
  'inProgressTechnologyVespene',
  'activeForcesMinerals',
  'activeForcesVespene',
  'lostArmyMinerals',
  'lostArmyVespene',
  'lostEconomyMinerals',
  'lostEconomyVespene',
  'lostTechnologyMinerals',
  'lostTechnologyVespene',
  'killedArmyMinerals',
  'killedArmyVespene',
  'killedEconomyMinerals',
  'killedEconomyVespene',
  'killedTechnologyMinerals',
  'killedTechnologyVespene',
  'friendlyFireArmyMinerals',
  'friendlyFireArmyVespene',
  'friendlyFireEconomyMinerals',
  'friendlyFireEconomyVespene',
  'friendlyFireTechnologyMinerals',
  'friendlyFireTechnologyVespene',
] as const

export type ReplayObserverEconomySample = Readonly<
  { gameLoop: number } & Partial<Record<(typeof economyFields)[number], number | null>>
>

export interface ReplayObserverProductionEvent {
  readonly observationGameLoop: number
  readonly kind:
    | 'unit-born'
    | 'construction-started'
    | 'construction-completed'
    | 'upgrade-completed'
    | 'morph-completed'
  readonly name: string
  readonly count: number | null
}

/** Structural input compatible with ReplayInsights; no shared-package dependency. */
export interface ReplayObserverAnalysisInput {
  readonly players: readonly {
    readonly playerId: number
    readonly slot?: number | null
    readonly name?: string | null
    readonly economy: readonly ReplayObserverEconomySample[]
    readonly production: readonly {
      readonly gameLoop: number
      readonly kind: ReplayObserverProductionEvent['kind']
      readonly name: string
      readonly count: number | null
    }[]
  }[]
}

export interface ReplayObserverPlayerAnalysis {
  readonly playerId: number
  readonly slot: number | null
  readonly name: string | null
  readonly economy: ReplayObserverEconomySample | null
  readonly economyAgeGameLoops: number | null
  readonly production: readonly ReplayObserverProductionEvent[]
  readonly observedProductionEventCount: number
}

function validateLoop(value: number): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError('gameLoop must be finite and nonnegative')
}

/** Samples observed records only, with at most ten recent production records per player. */
export function sampleReplayObserverAnalysis(
  input: ReplayObserverAnalysisInput,
  gameLoop: number,
): readonly ReplayObserverPlayerAnalysis[] {
  validateLoop(gameLoop)
  return Object.freeze(
    input.players.map((player) => {
      let latest: ReplayObserverEconomySample | null = null
      for (const sample of player.economy) {
        validateLoop(sample.gameLoop)
        if (sample.gameLoop <= gameLoop && (!latest || sample.gameLoop >= latest.gameLoop))
          latest = sample
      }
      let economy: ReplayObserverEconomySample | null = null
      if (latest) {
        const copy: { gameLoop: number } & Partial<
          Record<(typeof economyFields)[number], number | null>
        > = { gameLoop: latest.gameLoop }
        for (const field of economyFields) {
          if (latest[field] !== undefined) copy[field] = latest[field]
        }
        economy = Object.freeze(copy)
      }
      const recent: ReplayObserverAnalysisInput['players'][number]['production'][number][] = []
      let observedProductionEventCount = 0
      for (const event of player.production) {
        validateLoop(event.gameLoop)
        if (event.gameLoop > gameLoop) continue
        observedProductionEventCount++
        const index = recent.findIndex((record) => record.gameLoop > event.gameLoop)
        recent.splice(index < 0 ? recent.length : index, 0, event)
        if (recent.length > 10) recent.shift()
      }
      const production = Object.freeze(
        recent.map((event) =>
          Object.freeze({
            observationGameLoop: event.gameLoop,
            kind: event.kind,
            name: event.name,
            count: event.count,
          }),
        ),
      )
      return Object.freeze({
        playerId: player.playerId,
        slot: player.slot ?? null,
        name: player.name ?? null,
        economy,
        economyAgeGameLoops: latest ? gameLoop - latest.gameLoop : null,
        production,
        observedProductionEventCount,
      })
    }),
  )
}
