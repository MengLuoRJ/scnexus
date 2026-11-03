import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { ReplayProductionEvent } from '@scnexus/app-shared/types/replay-insights.type'
import ReplayProductionTiming from '../ReplayProductionTiming.vue'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import zhHant from '../../../locales/zh-Hant'

const event: ReplayProductionEvent = {
  gameLoop: 960,
  kind: 'unit-born',
  name: 'Marine',
  count: 1,
}
function render(value: ReplayProductionEvent, locale = 'en') {
  return mount(ReplayProductionTiming, {
    props: { event: value },
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { en, zh, 'zh-Hant': zhHant } })],
    },
  })
}

test.each(['en', 'zh', 'zh-Hant'])(
  'shows timing and an estimate label without technical evidence (%s)',
  (locale) => {
    const wrapper = render(
      {
        ...event,
        startGameLoop: 0,
        endGameLoop: 960,
        timingBasis: 'inferred',
        startSource: 'versioned-duration',
        endSource: 'tracker-born',
        durationVersion: '5.0.15',
        chrono: { state: 'adjusted', castGameLoops: [160], abilityLink: 1, producerTag: '1:1' },
      },
      locale,
    )
    expect(wrapper.text()).not.toContain('replay.productionTiming.')
    expect(wrapper.text()).toContain('0:00')
    expect(wrapper.text()).toContain('1:00')
    expect(wrapper.text()).not.toContain('0:10')
    expect(wrapper.text()).not.toContain('5.0.15')
    expect(wrapper.find('details').exists()).toBe(false)
    expect(wrapper.find('.text-warning').exists()).toBe(false)
    wrapper.unmount()
  },
)

test('missing timing remains unknown, never derived from event time or substituted with zero', async () => {
  const wrapper = render({
    ...event,
    timingBasis: 'unavailable',
    startGameLoop: null,
    endGameLoop: undefined,
  })
  expect(
    wrapper
      .findAll('dd')
      .slice(0, 2)
      .map((node) => node.text()),
  ).toEqual(['—', '—'])
  expect(wrapper.text()).not.toContain('1:00')
  await wrapper.setProps({ event })
  expect(wrapper.text()).toContain('1:00')
  expect(wrapper.text()).not.toContain('legacy')
  expect(wrapper.find('details').exists()).toBe(false)
  wrapper.unmount()
})

test('observed production shows only start and completion even when diagnostics exist', () => {
  const wrapper = render(
    {
      ...event,
      startGameLoop: 160,
      endGameLoop: 960,
      timingBasis: 'observed',
      startSource: 'tracker-init',
      endSource: 'tracker-done',
      chrono: { state: 'unavailable', castGameLoops: [], abilityLink: null, producerTag: null },
    },
    'zh',
  )
  expect(wrapper.text()).toContain('0:10')
  expect(wrapper.text()).toContain('1:00')
  expect(wrapper.text()).not.toContain('来源')
  expect(wrapper.text()).not.toContain('Tracker')
  expect(wrapper.text()).not.toContain('时空加速')
  expect(wrapper.find('details').exists()).toBe(false)
  wrapper.unmount()
})
