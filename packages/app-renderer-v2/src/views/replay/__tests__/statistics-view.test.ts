import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import ReplayStatistics from '../ReplayStatistics.vue'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import zhHant from '../../../locales/zh-Hant'

test.each(['en', 'zh', 'zh-Hant'])('renders an empty statistics panel honestly in %s', (locale) => {
  const wrapper = mount(ReplayStatistics, {
    props: { records: [] },
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { en, zh, 'zh-Hant': zhHant } })],
    },
  })
  expect(wrapper.text()).not.toContain('replay.statistics.')
  expect(wrapper.findAll('dl dd').map((cell) => cell.text())).toEqual([
    '0',
    '0',
    '0',
    '0',
    '0',
    locale === 'en' ? 'Unknown' : '未知',
  ])
  expect(wrapper.findAll('table')).toHaveLength(0)
  wrapper.unmount()
})

test('updates totals and grouped records when the library changes', async () => {
  const record: ReplayRecord = {
    id: '1',
    profileHandle: '5-S2-1-123',
    category: 'Multiplayer',
    path: 'D:\\sample.SC2Replay',
    fileName: 'sample.SC2Replay',
    extension: '.sc2replay',
    sizeBytes: 1,
    mtimeMs: 0,
    contentHash: 'hash',
    status: 'partial',
    supportLevel: 'metadata-only',
    mapName: '<Map>',
    playedAt: '2026-10-01T00:00:00Z',
    gameVersion: null,
    baseBuild: null,
    durationSeconds: null,
    warnings: [],
    players: [
      { slot: 1, profileHandle: '5-S2-1-123', name: 'Me', race: 'Terran', team: 1, result: 'win' },
      { slot: 2, name: 'Opponent', race: 'Zerg', team: 2, result: 'loss' },
    ],
  }
  const wrapper = mount(ReplayStatistics, {
    props: { records: [record] },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  expect(wrapper.findAll('table')).toHaveLength(3)
  expect(wrapper.get('tbody').text()).toContain('<Map>')
  expect(wrapper.find('map').exists()).toBe(false)
  expect(wrapper.text()).toContain('Zerg')
  expect(wrapper.text()).toContain('2026-10')
  expect(wrapper.findAll('dl dd').map((cell) => cell.text())).toEqual([
    '1',
    '1',
    '0',
    '0',
    '0',
    '100%',
  ])
  await wrapper.setProps({ records: [] })
  expect(wrapper.findAll('table')).toHaveLength(0)
  expect(wrapper.findAll('dl dd')[0]!.text()).toBe('0')
  wrapper.unmount()
})
