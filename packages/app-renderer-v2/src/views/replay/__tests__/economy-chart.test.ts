import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'vccs'
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

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
          this,
        )
      }
      unobserve() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(220)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 600,
    height: 220,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 220,
    toJSON: () => ({}),
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('renders shared numeric axes, distinct player colors, metric dashes and null gaps', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.getComponent(LineChart).props('height')).toBe(220)
  expect(wrapper.getComponent(XAxis).props()).toMatchObject({ type: 'number', domain: [0, 960] })
  expect(wrapper.getComponent(YAxis).props('domain')).toEqual([0, 200])
  const legends = wrapper.findAll('button')
  expect(legends).toHaveLength(4)
  expect(legends[0]!.text()).toContain('Same (#1)')
  expect(legends[2]!.text()).toContain('Same (#2)')
  expect(legends[0]!.attributes('style')).not.toBe(legends[2]!.attributes('style'))
  expect(legends[0]!.get('path').attributes('stroke-dasharray')).toBe('')
  expect(legends[1]!.get('path').attributes('stroke-dasharray')).toBe('6 3')
  const lines = wrapper.findAllComponents(Line)
  expect(lines).toHaveLength(4)
  expect(lines[0]!.props()).toMatchObject({
    type: 'linear',
    connectNulls: false,
    data: [
      { gameLoop: 160, value: 50 },
      { gameLoop: 320, value: null },
      { gameLoop: 480, value: 25 },
    ],
  })
  expect(wrapper.findAll('svg').length).toBeGreaterThan(4)
  wrapper.unmount()
})

test('toggles individual series without changing global axes', async () => {
  const wrapper = render()
  const button = wrapper.findAll('button')[0]!
  await button.trigger('click')
  expect(button.attributes('aria-pressed')).toBe('false')
  expect(wrapper.findAllComponents(Line)[0]!.props('hide')).toBe(true)
  expect(wrapper.findAllComponents(Line)[1]!.props('hide')).toBe(false)
  expect(wrapper.getComponent(YAxis).props('domain')).toEqual([0, 200])
  await button.trigger('click')
  expect(button.attributes('aria-pressed')).toBe('true')
  wrapper.unmount()
})

test('tooltip shows only exact-time actual samples from independent player histories', async () => {
  const wrapper = render()
  await flushPromises()
  const tooltip = wrapper.getComponent(Tooltip)
  const content = mount(
    defineComponent({
      setup: () => () =>
        tooltip.vm.$slots.content!({
          active: true,
          label: 240,
          payload: [],
          accessibilityLayer: true,
        }),
    }),
  )
  expect(content.text()).toContain('0:15')
  expect(content.text()).toContain('Same (#2) · Minerals')
  expect(content.text()).not.toContain('Same (#1)')
  await wrapper.findAll('button')[2]!.trigger('click')
  expect(content.text()).not.toContain('Minerals')
  expect(content.text()).toContain('Vespene')
  content.unmount()
  wrapper.unmount()
})

test('hovering late independent samples keeps the actual tooltip visible', async () => {
  const wrapper = render()
  await flushPromises()
  await vi.waitFor(() => {
    expect(wrapper.get('[role="application"]').attributes('style')).not.toContain(
      'visibility: hidden',
    )
  })
  await wrapper.get('[role="application"]').trigger('mousemove', { clientX: 580, clientY: 80 })
  await flushPromises()
  const tooltip = wrapper.get('[role="tooltip"]')
  await vi.waitFor(() => expect(tooltip.attributes('style')).toContain('visibility: visible'))
  expect(tooltip.text()).toContain('1:00')
  expect(tooltip.text()).toContain('Same (#2) · Minerals')
  expect(tooltip.text()).not.toContain('Same (#1)')
  wrapper.unmount()
})

test('does not render full histories as SVG circles', async () => {
  const wrapper = render(Array.from({ length: 10_000 }, (_, index) => sample(index * 16, index)))
  await flushPromises()
  expect(wrapper.findAllComponents(Line)[0]!.props('data')!.length).toBeLessThanOrEqual(1000)
  expect(wrapper.findAll('circle').length).toBeLessThanOrEqual(4)
  wrapper.unmount()
})

test('renders an empty state when all metrics are missing', async () => {
  const wrapper = render([])
  await wrapper.setProps({ players: [] })
  expect(wrapper.findComponent(LineChart).exists()).toBe(false)
  expect(wrapper.text()).toContain(en['replay.analysisFailed'])
  wrapper.unmount()
})

test('army value curves use separate actual mineral and vespene samples, retaining null gaps', async () => {
  const wrapper = render([])
  await wrapper.setProps({
    title: 'Army value (sampled)',
    metrics: ['armyMinerals', 'armyVespene'],
    players: [
      {
        playerId: 3,
        label: 'Army (#3)',
        samples: [
          { ...sample(160, null), armyMinerals: 200, armyVespene: 50 },
          { ...sample(320, null), armyMinerals: null, armyVespene: 0 },
        ],
      },
    ],
  })
  await flushPromises()
  const lines = wrapper.findAllComponents(Line)
  expect(lines).toHaveLength(2)
  expect(lines[0]!.props('data')).toEqual([
    { gameLoop: 160, value: 200 },
    { gameLoop: 320, value: null },
  ])
  expect(lines[1]!.props('data')).toEqual([
    { gameLoop: 160, value: 50 },
    { gameLoop: 320, value: 0 },
  ])
  expect(wrapper.text()).toContain('Army minerals')
  expect(wrapper.text()).toContain('Army vespene')
  wrapper.unmount()
})

test('signed loss counters retain negative raw samples inside shared chart bounds', async () => {
  const wrapper = render([])
  await wrapper.setProps({
    metrics: ['lostEconomyMinerals'],
    players: [
      {
        playerId: 1,
        label: 'One',
        samples: [
          { ...sample(480, null), lostEconomyMinerals: -69 },
          { ...sample(960, null), lostEconomyMinerals: null },
          { ...sample(1440, null), lostEconomyMinerals: 100 },
        ],
      },
      { playerId: 2, label: 'Two', samples: [{ ...sample(480, null), lostEconomyMinerals: -100 }] },
    ],
  })
  await flushPromises()
  expect(wrapper.getComponent(YAxis).props('domain')).toEqual([-100, 100])
  expect(wrapper.findAllComponents(Line)[0]!.props('data')).toEqual([
    { gameLoop: 480, value: -69 },
    { gameLoop: 960, value: null },
    { gameLoop: 1440, value: 100 },
  ])
  expect(wrapper.findAllComponents(Line)[1]!.props('data')).toEqual([
    { gameLoop: 480, value: -100 },
  ])
  wrapper.unmount()
})
