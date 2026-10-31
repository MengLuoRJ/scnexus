import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { ReplayEconomySample } from '@scnexus/app-shared/types/replay-insights.type'
import ReplayEconomyChart from '../ReplayEconomyChart.vue'
import en from '../../../locales/en'

function sample(gameLoop: number, minerals: number | null): ReplayEconomySample {
  return {
    gameLoop,
    minerals,
    vespene: 20,
    mineralIncome: null,
    vespeneIncome: null,
    workers: null,
    supplyUsed: null,
    supplyCap: null,
    armyMinerals: null,
    armyVespene: null,
  }
}

function render(samples = [sample(160, 50), sample(320, null), sample(480, 25)]) {
  return mount(ReplayEconomyChart, {
    props: {
      title: 'Resources',
      metrics: ['minerals', 'vespene'],
      players: [
        { playerId: 1, label: 'Same (#1)', samples },
        { playerId: 2, label: 'Same (#2)', samples: [sample(240, 50), sample(960, 200)] },
      ],
    },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

test('overlays players with labeled accessible samples, distinct colors, and metric line swatches', () => {
  const wrapper = render()
  const chart = wrapper.get('svg[role="img"]')
  expect(chart.attributes('viewBox')).toBe('0 0 580 182')
  const legends = wrapper.findAll('li')
  expect(legends).toHaveLength(4)
  expect(legends[0]!.text()).toContain('Same (#1)')
  expect(legends[2]!.text()).toContain('Same (#2)')
  expect(legends[0]!.attributes('style')).not.toBe(legends[2]!.attributes('style'))
  expect(legends[0]!.get('path').attributes('stroke-dasharray')).toBe('')
  expect(legends[1]!.get('path').attributes('stroke-dasharray')).toBe('6 3')
  const titles = chart.findAll('circle title').map((title) => title.text())
  expect(titles).toContain('Same (#1) · Minerals · 0:10: 50')
  expect(titles).toContain('Same (#2) · Minerals · 0:15: 50')
  expect(chart.findAll('polyline')).toHaveLength(5)
  wrapper.unmount()
})

test('does not render full histories as SVG circles', () => {
  const wrapper = render(Array.from({ length: 10_000 }, (_, index) => sample(index * 16, index)))
  expect(wrapper.findAll('circle').length).toBeLessThanOrEqual(2004)
  wrapper.unmount()
})
