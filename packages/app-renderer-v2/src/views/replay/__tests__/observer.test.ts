import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ReplayObserver from '../ReplayObserver.vue'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import zhHant from '../../../locales/zh-Hant'

test.each(['en', 'zh', 'zh-Hant'])(
  'old analysis explains how to obtain a timeline (%s)',
  (locale) => {
    const messages = { en, zh, 'zh-Hant': zhHant }
    const wrapper = mount(ReplayObserver, {
      props: { timeline: undefined },
      global: { plugins: [createI18n({ legacy: false, locale, messages })] },
    })
    expect(wrapper.text()).toContain(
      messages[locale as keyof typeof messages]['replay.observer.missing'],
    )
    expect(wrapper.text()).toContain(
      messages[locale as keyof typeof messages]['replay.observer.notice'],
    )
    expect(wrapper.find('input[type="range"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('replay.observer.')
    wrapper.unmount()
  },
)

const timeline = {
  version: 1 as const,
  baseBuild: 98310,
  durationGameLoops: 160,
  partial: true,
  diagnostics: [],
  units: [
    {
      unitTag: '10:2',
      unitTagIndex: 10,
      unitTagRecycle: 2,
      startedGameLoop: 0,
      diedGameLoop: 100,
      observations: [
        {
          gameLoop: 0,
          kind: 'born' as const,
          unitType: 'Marine',
          controlPlayerId: 1,
          upkeepPlayerId: 1,
          x: 20,
          y: 30,
          positionGameLoop: 0,
          completed: true,
        },
      ],
    },
  ],
}

test('queries the real headless manager when seeking, selecting, and replacing analysis', async () => {
  const wrapper = mount(ReplayObserver, {
    props: { timeline },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      stubs: { UButton: { template: '<button><slot /></button>' } },
    },
  })
  expect(wrapper.text()).toContain('Marine')
  expect(wrapper.text()).toContain('20, 30')
  expect(wrapper.text()).toContain(en['replay.observer.partial'])
  await wrapper.get('td button').trigger('click')
  expect(wrapper.text()).toContain('Selected unit: 10:2')
  await wrapper.get('input[type="range"]').setValue('80')
  expect(wrapper.text()).toContain('80 / 160')
  await wrapper.get('input[type="range"]').setValue('100')
  expect(wrapper.text()).toContain(en['replay.observer.empty'])
  await wrapper.setProps({ timeline: undefined })
  expect(wrapper.text()).toContain(en['replay.observer.missing'])
  wrapper.unmount()
})
