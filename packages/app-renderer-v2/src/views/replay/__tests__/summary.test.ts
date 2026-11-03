import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { ReplayEconomySample } from '@scnexus/app-shared/types/replay-insights.type'
import { buildReplaySummary, summaryMetrics } from '../summary'
import ReplayBattleSummary from '../ReplayBattleSummary.vue'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import hant from '../../../locales/zh-Hant'

function sample(gameLoop: number, values: Partial<ReplayEconomySample> = {}): ReplayEconomySample {
  return {
    gameLoop,
    minerals: null,
    vespene: null,
    mineralIncome: null,
    vespeneIncome: null,
    workers: null,
    supplyUsed: null,
    supplyCap: null,
    armyMinerals: null,
    armyVespene: null,
    ...values,
  }
}
function player(playerId: number, samples: ReplayEconomySample[], label = `Player ${playerId}`) {
  return { playerId, label, samples }
}

test('uses latest exact shared and individual samples without conflating different end times', () => {
  const players = [
    player(1, [sample(480, { minerals: 90 }), sample(160, { minerals: 10 })]),
    player(2, [sample(160, { minerals: 20 }), sample(320, { minerals: 200 })]),
  ]
  const summary = buildReplaySummary(players)
  expect(summary.commonGameLoop).toBe(160)
  expect(summary.simultaneousFinal).toBe(false)
  expect(summary.players.map((item) => item.final?.gameLoop)).toEqual([480, 320])
  expect(summary.players.map((item) => item.common?.values.minerals)).toEqual([10, 20])
  expect(players[0]!.samples[0]!.gameLoop).toBe(480)
  const disjoint = buildReplaySummary([player(1, [sample(10)]), player(2, [sample(11)])])
  expect(disjoint.commonGameLoop).toBeNull()
  expect(disjoint.players.map((item) => item.common)).toEqual([null, null])
})

test('keeps null or missing last values unknown rather than backfilling earlier known samples', () => {
  const final = buildReplaySummary([
    player(1, [sample(0, { minerals: 50, killedArmyMinerals: 100 }), sample(16)]),
  ]).players[0]!.final!
  expect(final.gameLoop).toBe(16)
  expect(summaryMetrics.every((metric) => final.values[metric] === null)).toBe(true)
  expect(final.exchange).toEqual({ minerals: null, vespene: null })
})

test('separates mineral and gas exchanges; preserves zero and negative corrections without invented ratios', () => {
  const snapshot = (values: Partial<ReplayEconomySample>) =>
    buildReplaySummary([player(1, [sample(16, values)])]).players[0]!.final!
  expect(snapshot({ killedArmyMinerals: 0, lostArmyMinerals: 10 }).exchange.minerals).toBe(0)
  expect(snapshot({ killedArmyMinerals: 10, lostArmyMinerals: 0 }).exchange.minerals).toBeNull()
  const corrected = snapshot({ minerals: -4, killedArmyMinerals: -1, lostArmyMinerals: 5 })
  expect(corrected.values.minerals).toBe(-4)
  expect(corrected.values.killedArmyMinerals).toBe(-1)
  expect(corrected.exchange.minerals).toBeNull()
  const negativeLoss = snapshot({ killedArmyMinerals: 10, lostArmyMinerals: -69 })
  expect(negativeLoss.values.lostArmyMinerals).toBe(-69)
  expect(negativeLoss.exchange.minerals).toBeNull()
  expect(
    snapshot({
      killedArmyMinerals: 100,
      lostArmyMinerals: 50,
      killedArmyVespene: 30,
      lostArmyVespene: 10,
    }).exchange,
  ).toEqual({ minerals: 2, vespene: 3 })
  expect(snapshot({ minerals: Number.NaN, vespene: Infinity }).values).toMatchObject({
    minerals: null,
    vespene: null,
  })
})

test('handles absent data, invalid times and final duplicate corrections', () => {
  expect(buildReplaySummary([])).toEqual({
    players: [],
    commonGameLoop: null,
    simultaneousFinal: false,
  })
  const summary = buildReplaySummary([
    player(1, [sample(-1), sample(Infinity), sample(Number.NaN)]),
    player(2, []),
  ])
  expect(summary.players.map((item) => item.final)).toEqual([null, null])
  expect(summary.simultaneousFinal).toBe(false)
  const corrected = buildReplaySummary([
    player(1, [sample(16, { minerals: 100 }), sample(16, { minerals: null })]),
    player(2, [sample(16)]),
  ])
  expect(corrected.simultaneousFinal).toBe(true)
  expect(corrected.players[0]!.final?.values.minerals).toBeNull()
})

test('renders escaped names, actual sample times, raw corrections and no-data state in each locale', () => {
  for (const [locale, messages] of Object.entries({ en, zh, 'zh-Hant': hant })) {
    const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } })
    const wrapper = mount(ReplayBattleSummary, {
      props: {
        players: [
          player(1, [sample(160), sample(480, { minerals: -25 })], '<img src=x onerror=alert(1)>'),
          player(2, [sample(160), sample(320)]),
        ],
      },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('0:30')
    expect(wrapper.text()).toContain('0:20')
    expect(wrapper.text()).not.toContain('0:10')
    expect(wrapper.text()).toContain('-25')
    expect(wrapper.findAll('details')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('replay.summary.')
    wrapper.unmount()
    const empty = mount(ReplayBattleSummary, {
      props: { players: [] },
      global: { plugins: [i18n] },
    })
    expect(empty.text()).toContain(i18n.global.t('replay.analysisFailed'))
    empty.unmount()
  }
})
