/** Raw tracker lifecycle counts, not trained units, combat-only losses, or enemy-only kills. */
export type ReplayUnitMetrics = {
  name: string
  initial: number
  born: number
  started: number
  completed: number
  lost: number
  kills: number
}
export type ReplayPlayerMetrics = {
  playerId: number | null
  userId: number | null
  slot: number | null
  name: string | null
  unitsState: 'available' | 'partial' | 'unavailable'
  kills: number | null
  enemyKills: number | null
  friendlyKills: number | null
  unknownKills: number | null
  units: ReplayUnitMetrics[]
  killTimeline: { gameLoop: number; kills: number }[]
  armyValue: { gameLoop: number; minerals: number | null; vespene: number | null }[]
  /** Raw command + selection + control-group operations 0/1/2; not official APM or EAPM. */
  apm: {
    actions: number | null
    commands: number | null
    selections: number | null
    controlGroups: number | null
    value: number | null
    state: 'available' | 'partial' | 'unavailable'
  }
}
export type ReplayMetrics = {
  version: string
  timeBasis: 'game-loops-16'
  /** Full decoded game stream duration only, never the final retained action. */
  durationGameLoops: number | null
  players: ReplayPlayerMetrics[]
  warnings: string[]
}

export type ReplayEconomySample = {
  gameLoop: number
  minerals: number | null
  vespene: number | null
  mineralIncome: number | null
  vespeneIncome: number | null
  workers: number | null
  supplyUsed: number | null
  supplyCap: number | null
  armyMinerals: number | null
  armyVespene: number | null
}
export type ReplayProductionEvent = {
  gameLoop: number
  kind: 'unit-born' | 'construction-started' | 'construction-completed' | 'upgrade-completed'
  name: string
  count: number | null
}
export type ReplayPlayerInsights = {
  playerId: number
  slot: number | null
  name: string | null
  economy: ReplayEconomySample[]
  production: ReplayProductionEvent[]
}
export type ReplayInsights = {
  version: string
  timeBasis: 'game-loops-16'
  players: ReplayPlayerInsights[]
}
