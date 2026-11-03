import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import ReplayScoreCharts from '../ReplayScoreCharts.vue'
import ReplayEconomyChart from '../ReplayEconomyChart.vue'
import { economyChart, scoreChartGroups } from '../insights'
import type { EconomyMetric } from '../insights'
import type { ReplayEconomySample } from '@scnexus/app-shared/types/replay-insights.type'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import zhHant from '../../../locales/zh-Hant'

const Button = defineComponent({
  props: ['label'],
  emits: ['click'],
  template: '<button @click="$emit(\'click\')">{{ label }}</button>',
})

test.each(['en', 'zh', 'zh-Hant'])(
  'all 39 score fields are reachable in one translated chart (%s)',
  async (locale) => {
    const messages = { en, zh, 'zh-Hant': zhHant }
    const wrapper = mount(ReplayScoreCharts, {
      props: {
        players: [
          {
            playerId: 1,
            label: 'Player',
            samples: [
              Object.fromEntries([
                ['gameLoop', 0],
                ...scoreChartGroups.flatMap((group) =>
                  group.sections.flatMap((section) => section.metrics.map((metric) => [metric, 0])),
                ),
              ]) as ReplayEconomySample,
            ],
          },
        ],
      },
      global: {
        plugins: [createI18n({ legacy: false, locale, messages })],
        stubs: { Button, ReplayEconomyChart: true },
      },
    })
    const metrics = new Set<EconomyMetric>()
    for (const group of scoreChartGroups) {
      await wrapper.get(`[data-score-group="${group.key}"]`).trigger('click')
      for (const section of group.sections) {
        if (group.sections.length > 1)
          await wrapper.get(`[data-score-category="${section.key}"]`).trigger('click')
        const charts = wrapper.findAllComponents(ReplayEconomyChart)
        expect(charts).toHaveLength(1)
        expect(charts[0]!.props('metrics')).toEqual(section.metrics)
        expect(wrapper.text()).not.toContain('replay.score.')
        expect(charts[0]!.props('title')).not.toContain('replay.score.')
        for (const metric of section.metrics) {
          metrics.add(metric)
          expect(Object.keys(messages[locale as keyof typeof messages])).toContain(
            `replay.metric.${metric}`,
          )
        }
      }
    }
    expect(metrics.size).toBe(39)
    wrapper.unmount()
  },
)

test('optional absent, undefined and non-finite values normalize to null and break curves', () => {
  const base: ReplayEconomySample = {
    gameLoop: 0,
    minerals: null,
    vespene: null,
    mineralIncome: null,
    vespeneIncome: null,
    workers: null,
    supplyUsed: null,
    supplyCap: null,
    armyMinerals: null,
    armyVespene: null,
  }
  const chart = economyChart(
    [
      { ...base, gameLoop: 16, lostArmyMinerals: 10 },
      { ...base, gameLoop: 32 },
      { ...base, gameLoop: 48, lostArmyMinerals: 0 },
      { ...base, gameLoop: 64, lostArmyMinerals: undefined },
      { ...base, gameLoop: 80, lostArmyMinerals: Number.NaN },
      { ...base, gameLoop: 96, lostArmyMinerals: Number.POSITIVE_INFINITY },
      { ...base, gameLoop: 112, lostArmyMinerals: 20 },
    ],
    ['lostArmyMinerals'],
  )
  expect(chart.max).toBe(20)
  expect(chart.series[0]!.data.map((point) => point.value)).toEqual([
    10,
    null,
    0,
    null,
    null,
    null,
    20,
  ])
  expect(chart.series[0]!.segments.map((segment) => segment.map((point) => point.value))).toEqual([
    [10],
    [0],
    [20],
  ])
})

test.each([en, zh, zhHant])('score labels do not collide with nested i18n prefixes', (messages) => {
  const keys = Object.keys(messages).filter((key) => key.startsWith('replay.score.'))
  for (const key of keys) {
    expect(keys.some((other) => other.startsWith(`${key}.`))).toBe(false)
  }
  expect(keys).toContain('replay.score.categoryLabel')
})

test('no score values means a failed module without empty chart controls', () => {
  const wrapper = mount(ReplayScoreCharts, {
    props: { players: [] },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      stubs: { Button, ReplayEconomyChart: true },
    },
  })
  expect(wrapper.get('h3').text()).toBe(en['replay.score.title'])
  expect(wrapper.get('p').text()).toBe(en['replay.analysisFailed'])
  expect(wrapper.find('button').exists()).toBe(false)
  expect(wrapper.findComponent(ReplayEconomyChart).exists()).toBe(false)
  wrapper.unmount()
})
