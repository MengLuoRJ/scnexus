import type { ReplayEconomySample } from '@scnexus/app-shared/types/replay-insights.type'

/** Project recorded PlayerStats fields only, regardless of game mode or player metadata. */
export function buildReplayEconomySample(
  gameLoop: number,
  stats: Record<string, unknown>,
): ReplayEconomySample {
  const stat = (field: string): number | null => {
    const value = stats[`m_scoreValue${field}`]
    return typeof value === 'number' &&
      Number.isFinite(value) &&
      (value >= 0 || /^(Minerals|Vespene)(Lost|Killed|FriendlyFire)/.test(field))
      ? value
      : null
  }
  const food = (field: string): number | null => {
    const value = stat(field)
    return value === null ? null : value / 4096
  }
  return {
    gameLoop,
    minerals: stat('MineralsCurrent'),
    vespene: stat('VespeneCurrent'),
    // Collection rates are already per minute; do not rescale by replay speed.
    mineralIncome: stat('MineralsCollectionRate'),
    vespeneIncome: stat('VespeneCollectionRate'),
    workers: stat('WorkersActiveCount'),
    supplyUsed: food('FoodUsed'),
    supplyCap: food('FoodMade'),
    armyMinerals: stat('MineralsUsedCurrentArmy'),
    armyVespene: stat('VespeneUsedCurrentArmy'),
    economyMinerals: stat('MineralsUsedCurrentEconomy'),
    economyVespene: stat('VespeneUsedCurrentEconomy'),
    technologyMinerals: stat('MineralsUsedCurrentTechnology'),
    technologyVespene: stat('VespeneUsedCurrentTechnology'),
    inProgressArmyMinerals: stat('MineralsUsedInProgressArmy'),
    inProgressArmyVespene: stat('VespeneUsedInProgressArmy'),
    inProgressEconomyMinerals: stat('MineralsUsedInProgressEconomy'),
    inProgressEconomyVespene: stat('VespeneUsedInProgressEconomy'),
    inProgressTechnologyMinerals: stat('MineralsUsedInProgressTechnology'),
    inProgressTechnologyVespene: stat('VespeneUsedInProgressTechnology'),
    activeForcesMinerals: stat('MineralsUsedActiveForces'),
    activeForcesVespene: stat('VespeneUsedActiveForces'),
    lostArmyMinerals: stat('MineralsLostArmy'),
    lostArmyVespene: stat('VespeneLostArmy'),
    lostEconomyMinerals: stat('MineralsLostEconomy'),
    lostEconomyVespene: stat('VespeneLostEconomy'),
    lostTechnologyMinerals: stat('MineralsLostTechnology'),
    lostTechnologyVespene: stat('VespeneLostTechnology'),
    killedArmyMinerals: stat('MineralsKilledArmy'),
    killedArmyVespene: stat('VespeneKilledArmy'),
    killedEconomyMinerals: stat('MineralsKilledEconomy'),
    killedEconomyVespene: stat('VespeneKilledEconomy'),
    killedTechnologyMinerals: stat('MineralsKilledTechnology'),
    killedTechnologyVespene: stat('VespeneKilledTechnology'),
    friendlyFireArmyMinerals: stat('MineralsFriendlyFireArmy'),
    friendlyFireArmyVespene: stat('VespeneFriendlyFireArmy'),
    friendlyFireEconomyMinerals: stat('MineralsFriendlyFireEconomy'),
    friendlyFireEconomyVespene: stat('VespeneFriendlyFireEconomy'),
    friendlyFireTechnologyMinerals: stat('MineralsFriendlyFireTechnology'),
    friendlyFireTechnologyVespene: stat('VespeneFriendlyFireTechnology'),
  }
}
