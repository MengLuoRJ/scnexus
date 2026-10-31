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
