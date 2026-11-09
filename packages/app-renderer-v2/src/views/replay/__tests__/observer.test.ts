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

test.each(['en', 'zh', 'zh-Hant'])(
  'filters units and navigates lifecycle events (%s)',
  async (locale) => {
    const messages = { en, zh, 'zh-Hant': zhHant }
    const labels = messages[locale as keyof typeof messages]
    const wrapper = mount(ReplayObserver, {
      props: { timeline },
      global: {
        plugins: [createI18n({ legacy: false, locale, messages })],
        stubs: {
          UButton: { template: '<button><slot /></button>' },
          UInput: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template:
              '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          },
        },
      },
    })
    const search = wrapper.get(`input[aria-label="${labels['replay.observer.search']}"]`)
    await search.setValue('probe')
    expect(wrapper.findAll('td button')).toHaveLength(0)
    await search.setValue('MARINE')
    expect(wrapper.findAll('td button')).toHaveLength(1)
    const life = wrapper.get(`select[aria-label="${labels['replay.observer.life']}"]`)
    await life.setValue('dead')
    expect(wrapper.findAll('td button')).toHaveLength(0)
    await wrapper.get('input[type="range"]').setValue('100')
    expect(wrapper.findAll('td button')).toHaveLength(1)
    await wrapper.get('td button').trigger('click')
    const details = wrapper.get(`section[aria-label="${labels['replay.observer.details']}"]`)
    expect(details.text()).toContain(labels['replay.observer.dead'])
    const start = details
      .findAll('button')
      .find((button) => button.text() === labels['replay.observer.jumpStart'])!
    await start.trigger('click')
    expect(wrapper.text()).toContain('0 / 160')
    const events = wrapper.get(`section[aria-label="${labels['replay.observer.events']}"]`)
    expect(events.findAll('li')).toHaveLength(2)
    await events.findAll('li button')[1]!.trigger('click')
    expect(wrapper.text()).toContain('100 / 160')
    expect(wrapper.text()).not.toContain('replay.observer.')
    await wrapper.setProps({ timeline: undefined })
    expect(wrapper.find('section').exists()).toBe(false)
    wrapper.unmount()
  },
)

test.each(['en', 'zh', 'zh-Hant'])(
  'time entry, clamped steps and filtered event navigation (%s)',
  async (locale) => {
    const messages = { en, zh, 'zh-Hant': zhHant }
    const labels = messages[locale as keyof typeof messages]
    const wrapper = mount(ReplayObserver, {
      props: {
        timeline,
        insights: {
          version: 'test',
          timeBasis: 'game-loops-16',
          players: [{ playerId: 1, slot: 1, name: 'Pilot &amp; Co', economy: [], production: [] }],
        },
      },
      global: {
        plugins: [createI18n({ legacy: false, locale, messages })],
        stubs: { UButton: { template: '<button><slot /></button>' }, UInput: true },
      },
    })
    const button = (key: string) =>
      wrapper.findAll('button').find((item) => item.text() === labels[key as keyof typeof labels])!
    const playerSelect = wrapper.get(`select[aria-label="${labels['replay.observer.owner']}"]`)
    expect(playerSelect.text()).toContain('Pilot & Co (#1)')
    expect(wrapper.get('tbody').text()).toContain('Pilot & Co (#1)')
    expect(button('replay.observer.backFive').attributes('disabled')).toBeDefined()
    expect(button('replay.observer.previousEvent').attributes('disabled')).toBeDefined()
    const time = wrapper.get(`input[aria-label="${labels['replay.observer.timeInput']}"]`)
    await time.setValue('0:05')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('input[type="range"]').element).toHaveProperty('value', '80')
    expect(wrapper.text()).toContain('0:05 / 0:10')
    await time.setValue('0:60')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.get('input[type="range"]').element).toHaveProperty('value', '80')
    await time.setValue('0:11')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await button('replay.observer.forwardFive').trigger('click')
    expect(wrapper.get('input[type="range"]').element).toHaveProperty('value', '160')
    expect(button('replay.observer.forwardFive').attributes('disabled')).toBeDefined()
    await button('replay.observer.restart').trigger('click')
    const kind = wrapper.get(`select[aria-label="${labels['replay.observer.eventType']}"]`)
    await kind.setValue('died')
    expect(wrapper.findAll('section li')).toHaveLength(1)
    await button('replay.observer.nextEvent').trigger('click')
    expect(wrapper.get('input[type="range"]').element).toHaveProperty('value', '100')
    expect(button('replay.observer.previousEvent').attributes('disabled')).toBeDefined()
    expect(button('replay.observer.nextEvent').attributes('disabled')).toBeDefined()
    await kind.setValue('all')
    await button('replay.observer.previousEvent').trigger('click')
    expect(wrapper.get('input[type="range"]').element).toHaveProperty('value', '0')
    await wrapper.setProps({ timeline: { ...timeline } })
    expect(kind.element).toHaveProperty('value', 'all')
    expect(time.element).toHaveProperty('value', '')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  },
)

test('indexed event pages reset after filtering, selection and timeline replacement', async () => {
  const wrapper = mount(ReplayObserver, {
    props: {
      timeline: {
        ...timeline,
        units: Array.from({ length: 12 }, (_, index) => ({
          ...timeline.units[0]!,
          unitTag: `${index}:1`,
          unitTagIndex: index,
          diedGameLoop: 100 + index,
        })),
      },
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      stubs: { UButton: { template: '<button><slot /></button>' }, UInput: true },
    },
  })
  const events = wrapper.get(`section[aria-label="${en['replay.observer.events']}"]`)
  const nextPage = () =>
    events.findAll('button').find((item) => item.text() === en['replay.observer.next'])!
  expect(events.findAll('li')).toHaveLength(10)
  await nextPage().trigger('click')
  expect(events.findAll('li')[0]!.text()).toContain('#10:1')
  await events.get('select').setValue('died')
  expect(events.findAll('li')).toHaveLength(10)
  expect(events.findAll('li')[0]!.text()).toContain('#0:1')
  await events.get('li button').trigger('click')
  expect(events.findAll('li')).toHaveLength(1)
  expect(nextPage()).toBeUndefined()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === en['replay.observer.clearSelection'])!
    .trigger('click')
  await nextPage().trigger('click')
  expect(events.findAll('li')).toHaveLength(2)
  await wrapper.setProps({ timeline })
  expect(events.findAll('li')).toHaveLength(2)
  expect(events.text()).toContain('#10:2')
  expect(events.get('select').element).toHaveProperty('value', 'all')
  expect(nextPage()).toBeUndefined()
  wrapper.unmount()
})
