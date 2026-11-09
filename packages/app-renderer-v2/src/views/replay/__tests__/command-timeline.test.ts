import { expect, test } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { ReplayAnalysis } from '@scnexus/app-shared/types/replay.type'
import ReplayCommandTimeline from '../ReplayCommandTimeline.vue'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import zhHant from '../../../locales/zh-Hant'

const analysis: ReplayAnalysis = {
  replayId: '1',
  contentHash: 'hash',
  parserVersion: 'test',
  baseBuild: 98310,
  status: 'partial',
  components: { initData: null, attributes: null, tracker: null },
  capabilities: {
    initData: { state: 'missing', decoder: null, sourceBuild: 98310 },
    attributes: { state: 'missing', decoder: null, sourceBuild: 98310 },
    tracker: { state: 'missing', decoder: null, sourceBuild: 98310 },
    game: { state: 'available', decoder: 's2protocol-98310', sourceBuild: 98310 },
  },
  warnings: [],
  analyzedAt: '',
  commands: Array.from({ length: 45 }, (_, index) => ({
    gameLoop: (index + 1) * 16,
    userId: index === 44 ? 4 : 0,
    abilityLink: index === 44 ? null : 123,
    abilityIndex: 2,
    flags: 0,
    target: { kind: 'unknown' },
  })),
}
function render(value: ReplayAnalysis | null = analysis, locale = 'en') {
  return mount(ReplayCommandTimeline, {
    props: { analysis: value, busy: false },
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { en, zh, 'zh-Hant': zhHant } })],
      stubs: {
        Button: defineComponent({
          props: ['label', 'disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
        }),
        Select: defineComponent({
          props: ['modelValue', 'items'],
          emits: ['update:modelValue'],
          template:
            '<select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select>',
        }),
      },
    },
  })
}
test('shows raw user zero, paginates, and resets on user change without guessing training', async () => {
  const wrapper = render()
  expect(wrapper.get('select').text()).toContain('Command user #0')
  expect(wrapper.findAll('li')).toHaveLength(20)
  expect(wrapper.text()).toContain('Ability 123 · command 2')
  expect(wrapper.text()).toContain('do not prove execution')
  await wrapper.findAll('button')[1]!.trigger('click')
  expect(wrapper.text()).toContain('2 / 3')
  await wrapper.get('select').setValue('4')
  expect(wrapper.findAll('li')).toHaveLength(1)
  expect(wrapper.text()).toContain('Command without an ability')
  expect(wrapper.text()).toContain('1 / 1')
  wrapper.unmount()
})
test.each(['en', 'zh', 'zh-Hant'])(
  'shows target evidence without interpreting point coordinates or inventing issuers in %s',
  (locale) => {
    const base = { ...analysis.commands![0]!, gameLoop: 64 }
    const wrapper = render(
      {
        ...analysis,
        commands: [
          {
            ...base,
            target: {
              kind: 'unit',
              rawTag: 262146,
              unitTag: '1:2',
              unitType: '<Marine>',
              observedGameLoop: 32,
            },
          },
          {
            ...base,
            target: {
              kind: 'unit',
              rawTag: 4294967295,
              unitTag: null,
              unitType: null,
              observedGameLoop: null,
            },
          },
          { ...base, target: { kind: 'point', rawPoint: { x: 123456789, y: 8192, z: null } } },
          { ...base, target: { kind: 'none' } },
          { ...base, target: { kind: 'data', value: 1 } },
          { ...base, target: { kind: 'unknown' } },
        ],
      },
      locale,
    )
    expect(wrapper.findAll('li')).toHaveLength(6)
    expect(wrapper.text()).toContain('<Marine> #1:2')
    expect(wrapper.text()).toContain('0:02')
    expect(wrapper.text()).toContain('4294967295')
    expect(wrapper.text()).not.toContain('123456789')
    expect(wrapper.text()).not.toContain('replay.commands.target')
    expect(wrapper.find('marine').exists()).toBe(false)
    wrapper.unmount()
  },
)

test.each(['en', 'zh', 'zh-Hant'])('localizes unavailable commands in %s', (locale) => {
  const wrapper = render(null, locale)
  expect(wrapper.find('ol').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('replay.commands.')
  wrapper.unmount()
})
test.each(['en', 'zh', 'zh-Hant'])(
  'shows provisional data with a persistent compatibility warning in %s',
  (locale) => {
    const wrapper = render(
      {
        ...analysis,
        baseBuild: 1000000,
        capabilities: {
          ...analysis.capabilities!,
          game: {
            state: 'partial',
            decoder: 's2protocol-98310',
            sourceBuild: 1000000,
            compatibility: { state: 'unverified', protocolBuild: 98310, candidateBuilds: [98310] },
          },
        },
      },
      locale,
    )
    expect(wrapper.findAll('li')).toHaveLength(20)
    expect(wrapper.get('[role="status"]').text()).toContain('1000000')
    expect(wrapper.get('[role="status"]').text()).toContain('98310')
    expect(wrapper.text()).not.toContain('replay.commands.unverified')
    wrapper.unmount()
  },
)
test('does not show stale or incomplete commands when the component failed', () => {
  const wrapper = render({
    ...analysis,
    capabilities: {
      ...analysis.capabilities!,
      game: { state: 'corrupt', decoder: null, sourceBuild: 98310 },
    },
  })
  expect(wrapper.find('ol').exists()).toBe(false)
  expect(wrapper.text()).toContain('could not be fully decoded')
  wrapper.unmount()
})
