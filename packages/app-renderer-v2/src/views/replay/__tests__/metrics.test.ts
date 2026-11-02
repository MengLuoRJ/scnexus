import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import type { ReplayAnalysis, ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import type {
  ReplayMetrics as Metrics,
  ReplayPlayerMetrics,
} from '@scnexus/app-shared/types/replay-insights.type'
import ReplayMetrics from '../ReplayMetrics.vue'
import ReplayAnalysisDialog from '../ReplayAnalysisDialog.vue'
import ReplayEconomyChart from '../ReplayEconomyChart.vue'
import en from '../../../locales/en'

const record: ReplayRecord = {
  id: 'metrics',
  profileHandle: '1-S2-1-1',
  category: 'Multiplayer',
  path: 'D:\\test.SC2Replay',
  fileName: 'test.SC2Replay',
  extension: '.sc2replay',
  sizeBytes: 1,
  mtimeMs: 1,
  contentHash: null,
  status: 'partial',
  supportLevel: 'metadata-only',
  mapName: null,
  playedAt: null,
  gameVersion: null,
  baseBuild: null,
  durationSeconds: null,
  players: [
    {
      slot: 3,
      name: '<img src=x onerror=alert(1)>',
      race: null,
      team: 1,
      result: null,
      profileHandle: null,
    },
  ],
  warnings: [],
}
function player(overrides: Partial<ReplayPlayerMetrics> = {}): ReplayPlayerMetrics {
  return {
    playerId: 7,
    slot: 3,
    userId: 0,
    name: null,
    kills: 8,
    enemyKills: 6,
    friendlyKills: 1,
    unknownKills: 1,
    killTimeline: [],
    unitsState: 'available',
    units: [{ name: 'Marine', initial: 1, born: 4, started: 0, completed: 0, lost: 2, kills: 8 }],
    armyValue: [{ gameLoop: 160, minerals: 200, vespene: 0 }],
    apm: {
      actions: 120,
      commands: 70,
      selections: 30,
      controlGroups: 20,
      value: 60,
      state: 'available',
    },
    ...overrides,
  }
}
function metrics(players = [player()]): Metrics {
  return {
    version: '1',
    timeBasis: 'game-loops-16',
    durationGameLoops: 1920,
    players,
    warnings: [],
  }
}
const Button = defineComponent({
  props: ['label', 'disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
})
const Select = defineComponent({
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  template:
    '<select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
})
const Input = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})
function global() {
  return {
    plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    stubs: {
      Button,
      Select,
      Input,
      Modal: { template: '<div><slot name="body" /><slot name="footer" /></div>' },
      ReplayEconomyChart: true,
    },
  }
}

test('ordinary Multiplayer shows all four metrics without co-op or insights players and keeps default resources chart', async () => {
  const wrapper = mount(ReplayAnalysisDialog, {
    props: {
      record,
      analysis: { status: 'partial', metrics: metrics() } as ReplayAnalysis,
      loaded: true,
      busy: false,
      error: '',
    },
    global: global(),
  })
  const view = wrapper.getComponent(ReplayMetrics)
  for (const key of ['kills', 'apm', 'units'])
    expect(view.text()).toContain(en[`replay.metrics.${key}` as keyof typeof en])
  expect(view.text()).toContain(en['replay.armyValue'])
  expect(view.text()).toContain('60')
  expect(view.text()).toContain('200')
  expect(view.text()).toContain('Marine')
  expect(wrapper.getComponent(ReplayEconomyChart).props('metrics')).toEqual(['minerals', 'vespene'])
  await wrapper
    .findAll('button')
    .find((button) => button.text() === en['replay.armyValue'])!
    .trigger('click')
  expect(wrapper.getComponent(ReplayEconomyChart).props('metrics')).toEqual([
    'armyMinerals',
    'armyVespene',
  ])
  expect(wrapper.getComponent(ReplayEconomyChart).props('players')[0]).toMatchObject({
    playerId: 7,
    samples: [{ gameLoop: 160, armyMinerals: 200, armyVespene: 0 }],
  })
  expect(wrapper.find('img').exists()).toBe(false)
  wrapper.unmount()
})

test('missing data remains unknown rather than zero; game-only and tracker-only rows remain usable', async () => {
  const wrapper = mount(ReplayMetrics, { props: { record }, global: global() })
  expect(wrapper.text()).toContain(en['replay.unknown'])
  expect(wrapper.find('table').exists()).toBe(false)
  await wrapper.setProps({
    metrics: metrics([
      player({
        playerId: null,
        slot: null,
        userId: 4,
        kills: null,
        enemyKills: null,
        friendlyKills: null,
        unknownKills: null,
        units: [],
        unitsState: 'unavailable',
        armyValue: [],
        apm: {
          actions: 120,
          commands: 70,
          selections: 30,
          controlGroups: 20,
          value: null,
          state: 'partial',
        },
      }),
    ]),
  })
  expect(wrapper.get('select').text()).toContain('Game user 4 (unmapped)')
  expect(wrapper.get('select').text()).not.toContain('img')
  expect(wrapper.text()).toContain('Recorded actions: 120')
  expect(wrapper.get(`[aria-label="${en['replay.metrics.kills']}"]`).text()).toContain('Unknown')
  expect(wrapper.text()).toContain('Partial data')
  await wrapper.setProps({
    metrics: metrics([
      player({
        kills: 0,
        apm: {
          actions: null,
          commands: null,
          selections: null,
          controlGroups: null,
          value: null,
          state: 'unavailable',
        },
      }),
    ]),
  })
  expect(wrapper.get(`[aria-label="${en['replay.metrics.kills']}"]`).text()).toContain('0')
  expect(wrapper.text()).toContain('Marine')
  expect(wrapper.get(`[aria-label="${en['replay.metrics.apm']}"]`).text()).toContain('Unknown')
  wrapper.unmount()
})

test('unit identifiers are escaped, titled, searchable and paginated with participant resets', async () => {
  const units = Array.from({ length: 25 }, (_, index) => ({
    name: index === 24 ? '<script>payload</script>' : `Unit${index}`,
    initial: 0,
    born: index,
    started: 0,
    completed: 0,
    lost: 0,
    kills: 0,
  }))
  const wrapper = mount(ReplayMetrics, {
    props: { record, metrics: metrics([player({ units }), player({ playerId: 8, units: [] })]) },
    global: global(),
  })
  expect(wrapper.findAll('tbody tr')).toHaveLength(12)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Next')!
    .trigger('click')
  expect(wrapper.text()).toContain('2 / 3')
  await wrapper.get('input').setValue('payload')
  expect(wrapper.findAll('tbody tr')).toHaveLength(1)
  expect(wrapper.get('tbody th').attributes('title')).toBe('<script>payload</script>')
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.text()).toContain('1 / 1')
  await wrapper.get('select').setValue(1)
  expect(wrapper.find('table').exists()).toBe(false)
  wrapper.unmount()
})
