import { expect, test } from 'vitest'
import { buildReplayEconomySample } from '../replay-stats'

test('projects all 39 score fields without inventing missing values', () => {
  const result = buildReplayEconomySample(160, {})
  expect(Object.keys(result)).toHaveLength(40)
  expect(result.gameLoop).toBe(160)
  expect(Object.values(result).slice(1)).toEqual(Array(39).fill(null))
})

test('keeps stocks, cumulative counters and fixed-point food distinct', () => {
  const result = buildReplayEconomySample(320, {
    m_scoreValueMineralsCurrent: 0,
    m_scoreValueMineralsUsedInProgressArmy: 125,
    m_scoreValueMineralsUsedCurrentTechnology: 200,
    m_scoreValueVespeneUsedActiveForces: 50,
    m_scoreValueMineralsLostArmy: 300,
    m_scoreValueMineralsKilledArmy: 400,
    m_scoreValueVespeneFriendlyFireEconomy: 25,
    m_scoreValueFoodUsed: 12288,
    m_scoreValueFoodMade: 40960,
    m_scoreValueMineralsCollectionRate: 800,
  })
  expect(result).toMatchObject({
    minerals: 0,
    inProgressArmyMinerals: 125,
    technologyMinerals: 200,
    activeForcesVespene: 50,
    lostArmyMinerals: 300,
    killedArmyMinerals: 400,
    friendlyFireEconomyVespene: 25,
    supplyUsed: 3,
    supplyCap: 10,
    mineralIncome: 800,
    vespene: null,
  })
})

test('preserves signed recorded score counters instead of discarding negative corrections', () => {
  expect(
    buildReplayEconomySample(480, { m_scoreValueMineralsLostEconomy: -69 }).lostEconomyMinerals,
  ).toBe(-69)
})

test.each([NaN, Infinity, '12', undefined])(
  'rejects invalid counter %s rather than filling zero',
  (value) => {
    expect(
      buildReplayEconomySample(0, { m_scoreValueMineralsLostArmy: value }).lostArmyMinerals,
    ).toBeNull()
  },
)
