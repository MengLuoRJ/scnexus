import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { ReplayAnalysis } from '@scnexus/app-shared/types/replay.type'
import { createReplayObserver } from '@scnexus/sc2-observer'
import ReplayObserverAnalysis from '../ReplayObserverAnalysis.vue'
import ReplayObserver from '../ReplayObserver.vue'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import zhHant from '../../../locales/zh-Hant'

const economy = {
  gameLoop: 32,
  minerals: 0,
  vespene: null,
  workers: 12,
  supplyUsed: 14,
  supplyCap: 23,
  mineralIncome: null,
  vespeneIncome: null,
  armyMinerals: null,
  armyVespene: null,
  lostArmyMinerals: 0,
  lostArmyVespene: null,
}
const insights: NonNullable<ReplayAnalysis['insights']> = {
  version: 'test',
  timeBasis: 'game-loops-16',
  players: [
    {
      playerId: 1,
      slot: 1,
      name: 'Player One',
      economy: [economy, { ...economy, gameLoop: 128, minerals: 999 }],
      production: [
        { gameLoop: 40, kind: 'unit-born', name: 'MarineObserved', count: null },
        {
          gameLoop: 160,
          startGameLoop: 20,
          kind: 'construction-completed',
          name: 'FutureFactory',
          count: 1,
        },
      ],
    },
  ],
}
const timeline: NonNullable<ReplayAnalysis['spatial']> = {
  version: 1,
  baseBuild: 98310,
  durationGameLoops: 200,
  partial: false,
  diagnostics: [],
  units: [
    {
      unitTag: '10:1',
      unitTagIndex: 10,
      unitTagRecycle: 1,
      startedGameLoop: 0,
      diedGameLoop: 80,
      observations: [
        {
          gameLoop: 0,
          kind: 'born',
          unitType: 'Marine',
          controlPlayerId: 1,
          upkeepPlayerId: 1,
          completed: true,
          x: 3,
          y: 4,
          positionGameLoop: 0,
        },
      ],
    },
  ],
}
function global(locale = 'en') {
  return {
    plugins: [createI18n({ legacy: false, locale, messages: { en, zh, 'zh-Hant': zhHant } })],
    stubs: { UButton: { template: '<button><slot /></button>' }, UInput: true },
  }
}

test.each(['en', 'zh', 'zh-Hant'])(
  'samples only past data, preserves zero/unknown, and seeks backwards (%s)',
  async (locale) => {
    const labels = { en, zh, 'zh-Hant': zhHant }[locale]!
    const observer = createReplayObserver(timeline)
    const wrapper = mount(ReplayObserverAnalysis, {
      props: { insights, timeline, gameLoop: 0, units: observer.getState().units, partial: true },
      global: global(locale),
    })
    expect(wrapper.text()).toContain(labels['replay.observer.analysis.noSample'])
    expect(wrapper.text()).toContain(labels['replay.observer.analysis.partial'])
    expect(wrapper.text()).not.toContain('MarineObserved')
    await wrapper.setProps({ gameLoop: 48, units: observer.seek(48).units })
    expect(wrapper.text()).toContain('MarineObserved')
    expect(wrapper.text()).not.toContain('FutureFactory')
    expect(wrapper.text()).not.toContain('999')
    const terms = wrapper.findAll('dl > div')
    expect(terms[0]!.get('dd').text()).toBe('0')
    expect(terms[1]!.get('dd').text()).toBe(labels['replay.unknown'])
    expect(terms[4]!.get('dd').text()).toBe(`0 / ${labels['replay.unknown']}`)
    const sample = wrapper.findAll('button').find((button) => button.text().includes('32'))!
    await sample.trigger('click')
    expect(wrapper.emitted('seek')?.[0]).toEqual([32])
    await wrapper.setProps({ gameLoop: 160, units: observer.seek(160).units })
    expect(wrapper.text()).toContain('FutureFactory')
    expect(wrapper.text()).toContain('999')
    const death = wrapper.findAll('button').find((button) => button.text().includes('#10:1'))!
    await death.trigger('click')
    expect(wrapper.emitted('selectEvent')?.[0]).toEqual(['10:1', 80])
    await wrapper.setProps({ gameLoop: 0, units: observer.seek(0).units })
    expect(wrapper.text()).not.toContain('FutureFactory')
    expect(wrapper.text()).not.toContain('MarineObserved')
    expect(wrapper.text()).not.toContain('#10:1')
    expect(wrapper.text()).not.toContain('replay.observer.analysis.')
    wrapper.unmount()
    observer.dispose()
  },
)

test('playback seeking drives the linked panel and production navigation pauses at the event', async () => {
  const wrapper = mount(ReplayObserver, { props: { timeline, insights }, global: global() })
  const slider = wrapper.get('input[type="range"]')
  await slider.setValue('48')
  const panel = wrapper.getComponent(ReplayObserverAnalysis)
  expect(panel.text()).toContain('MarineObserved')
  expect(panel.text()).not.toContain('FutureFactory')
  const event = panel.findAll('button').find((button) => button.text().includes('MarineObserved'))!
  const play = wrapper
    .findAll('button')
    .find((button) => button.text() === en['replay.observer.play'])!
  await play.trigger('click')
  expect(play.text()).toBe(en['replay.observer.pause'])
  await event.trigger('click')
  expect(play.text()).toBe(en['replay.observer.play'])
  expect(wrapper.text()).toContain('40 / 200')
  await slider.setValue('160')
  expect(panel.text()).toContain('FutureFactory')
  await slider.setValue('0')
  expect(panel.text()).not.toContain('MarineObserved')
  wrapper.unmount()
})

test('missing analysis retains entity summary without fabricating economic values', () => {
  const observer = createReplayObserver(timeline)
  const wrapper = mount(ReplayObserverAnalysis, {
    props: { timeline, gameLoop: 0, units: observer.getState().units },
    global: global(),
  })
  expect(wrapper.text()).toContain(en['replay.observer.analysis.noSample'])
  expect(wrapper.find('dl').exists()).toBe(false)
  expect(wrapper.text()).toContain('1 alive')
  wrapper.unmount()
  observer.dispose()
})
