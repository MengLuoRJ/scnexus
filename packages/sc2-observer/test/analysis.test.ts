import { describe, expect, it } from 'vitest'
import { sampleReplayObserverAnalysis, summarizeReplayObserverUnits } from '../src/index.js'
import type { ReplayObserverAnalysisInput, ReplayObserverUnit } from '../src/index.js'

function fixture() {
  return {
    players: [
      {
        playerId: 1,
        slot: 0,
        name: 'Player',
        economy: [
          { gameLoop: 30, minerals: 100, lostArmyMinerals: 150, lostArmyVespene: 25 },
          {
            gameLoop: 10,
            minerals: 0,
            vespene: null,
            workers: 12,
            supplyUsed: 12,
            supplyCap: 15,
            lostArmyMinerals: 0,
            lostArmyVespene: null,
          },
        ],
        production: [
          {
            gameLoop: 30,
            kind: 'construction-completed' as const,
            name: 'Barracks',
            count: 1,
            startGameLoop: 5,
            endGameLoop: 30,
            timingBasis: 'inferred',
          },
          {
            gameLoop: 10,
            kind: 'construction-started' as const,
            name: 'Barracks',
            count: null,
            startGameLoop: 5,
            endGameLoop: 30,
            chrono: { castGameLoops: [20] },
          },
        ],
      },
      { playerId: 2, economy: [], production: [] },
    ],
  }
}

describe('analysis sampling', () => {
  it('uses latest economy at or before the loop, preserving zeros, nulls and sample age', () => {
    const input = fixture()
    expect(sampleReplayObserverAnalysis(input, 0)[0]).toMatchObject({
      economy: null,
      economyAgeGameLoops: null,
      production: [],
      observedProductionEventCount: 0,
    })
    const atSample = sampleReplayObserverAnalysis(input, 10)[0]!
    expect(atSample.economy).toEqual(input.players[0]!.economy[1])
    expect(atSample.economyAgeGameLoops).toBe(0)
    expect(sampleReplayObserverAnalysis(input, 29)[0]).toMatchObject({
      economy: { gameLoop: 10, minerals: 0, lostArmyMinerals: 0, lostArmyVespene: null },
      economyAgeGameLoops: 19,
    })
    expect(sampleReplayObserverAnalysis(input, 30)[0]).toMatchObject({
      economy: { gameLoop: 30, minerals: 100, lostArmyMinerals: 150 },
      economyAgeGameLoops: 0,
    })
    expect(sampleReplayObserverAnalysis(input, 10)[0]).toEqual(atSample)
    expect(sampleReplayObserverAnalysis(input, 10)[1]).toEqual({
      playerId: 2,
      slot: null,
      name: null,
      economy: null,
      economyAgeGameLoops: null,
      production: [],
      observedProductionEventCount: 0,
    })
  })

  it('reveals production only at observation time and excludes inferred intervals and metadata', () => {
    const input = fixture()
    expect(sampleReplayObserverAnalysis(input, 9)[0]!.production).toEqual([])
    expect(sampleReplayObserverAnalysis(input, 10)[0]!.production).toEqual([
      { observationGameLoop: 10, kind: 'construction-started', name: 'Barracks', count: null },
    ])
    const final = sampleReplayObserverAnalysis(input, 30)[0]!
    expect(final.observedProductionEventCount).toBe(2)
    expect(final.production[1]).toEqual({
      observationGameLoop: 30,
      kind: 'construction-completed',
      name: 'Barracks',
      count: 1,
    })
    expect(sampleReplayObserverAnalysis(input, 5)[0]!.production).toEqual([])
  })

  it('bounds recent records to ten, sorts stably, and counts observed events rather than units', () => {
    const input: ReplayObserverAnalysisInput = {
      players: [
        {
          playerId: 0,
          economy: [],
          production: Array.from({ length: 15 }, (_, index) => ({
            gameLoop: index < 2 ? 5 : 10,
            kind: 'unit-born' as const,
            name: String(index),
            count: 20,
          })).reverse(),
        },
      ],
    }
    const result = sampleReplayObserverAnalysis(input, 10)[0]!
    expect(result.observedProductionEventCount).toBe(15)
    expect(result.production.map((event) => event.name)).toEqual([
      '11',
      '10',
      '9',
      '8',
      '7',
      '6',
      '5',
      '4',
      '3',
      '2',
    ])
    expect(
      sampleReplayObserverAnalysis(input, 5)[0]!.production.map((event) => event.name),
    ).toEqual(['1', '0'])
  })

  it('copies and freezes output without mutating or freezing input or retaining extra fields', () => {
    const input = fixture()
    const original = JSON.stringify(input)
    const result = sampleReplayObserverAnalysis(input, 30)
    const player = result[0]!
    expect(JSON.stringify(input)).toBe(original)
    expect(Object.isFrozen(input.players[0]!.economy[0])).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(player)).toBe(true)
    expect(Object.isFrozen(player.economy)).toBe(true)
    expect(Object.isFrozen(player.production)).toBe(true)
    expect(Object.isFrozen(player.production[0])).toBe(true)
    input.players[0]!.economy[0]!.minerals = 999
    input.players[0]!.production[0]!.name = 'Changed'
    expect(player.economy!.minerals).toBe(100)
    expect(player.production[1]!.name).toBe('Barracks')
    const extra = { gameLoop: 0, futureTotal: 999 }
    expect(
      sampleReplayObserverAnalysis(
        { players: [{ playerId: 1, economy: [extra], production: [] }] },
        0,
      )[0]!.economy,
    ).toEqual({ gameLoop: 0 })
  })

  it('uses the last input sample on equal loops and accepts fractional loops', () => {
    const input = {
      players: [
        {
          playerId: 1,
          economy: [
            { gameLoop: 0, minerals: 0 },
            { gameLoop: 0, minerals: null },
          ],
          production: [],
        },
      ],
    }
    expect(sampleReplayObserverAnalysis(input, 0.5)[0]).toMatchObject({
      economy: { gameLoop: 0, minerals: null },
      economyAgeGameLoops: 0.5,
    })
  })

  it.each([-1, NaN, Infinity, -Infinity])('rejects invalid loops %s in query and input', (loop) => {
    expect(() => sampleReplayObserverAnalysis({ players: [] }, loop)).toThrow(RangeError)
    const input = fixture()
    input.players[0]!.economy[0]!.gameLoop = loop
    expect(() => sampleReplayObserverAnalysis(input, 0)).toThrow(RangeError)
    const productionInput = fixture()
    productionInput.players[0]!.production[0]!.gameLoop = loop
    expect(() => sampleReplayObserverAnalysis(productionInput, 0)).toThrow(RangeError)
  })
})

describe('recorded entity summaries', () => {
  it('groups sampled controllers including neutral and unknown, and counts living construction only', () => {
    const makeUnit = (
      controlPlayerId: number | null,
      alive: boolean,
      completed: boolean,
    ): ReplayObserverUnit => ({
      unitTag: '',
      controlPlayerId,
      upkeepPlayerId: 9,
      unitType: null,
      alive,
      completed,
      position: null,
    })
    const units = [
      makeUnit(1, true, true),
      makeUnit(1, true, false),
      makeUnit(1, false, false),
      makeUnit(0, true, true),
      makeUnit(null, false, true),
    ]
    const result = summarizeReplayObserverUnits(units)
    expect(result).toEqual([
      { playerId: 1, alive: 2, dead: 1, underConstruction: 1 },
      { playerId: 0, alive: 1, dead: 0, underConstruction: 0 },
      { playerId: null, alive: 0, dead: 1, underConstruction: 0 },
    ])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result[0])).toBe(true)
    expect(Object.isFrozen(units[0])).toBe(false)
    expect(summarizeReplayObserverUnits([])).toEqual([])
  })
})
