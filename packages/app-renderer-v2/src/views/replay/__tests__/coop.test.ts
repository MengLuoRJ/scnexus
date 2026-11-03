import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type {
  ReplayCoopAnalysis,
  ReplayCoopPlayer,
  ReplayCoopSummary,
} from '@scnexus/app-shared/types/replay-coop.type'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import ReplayCoopDetails from '../ReplayCoopDetails.vue'
import { replayCoopProfilePlayer } from '../coop'
import { buildReplayStatistics } from '../statistics'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import zhHant from '../../../locales/zh-Hant'

const handle = '5-S2-1-123'
function player(overrides: Partial<ReplayCoopPlayer> = {}): ReplayCoopPlayer {
  return {
    slotId: 0,
    userId: 0,
    playerId: null,
    profileHandle: handle,
    commander: 'Raynor',
    level: null,
    prestige: null,
    masteryLevel: null,
    masteryTalents: null,
    difficulty: null,
    brutalPlus: null,
    retryMutationIndexes: null,
    ...overrides,
  }
}
function summary(players = [player()]): ReplayCoopSummary {
  return {
    identification: 'confirmed',
    players,
    difficulty: 4,
    mutators: { state: 'unknown', ids: null },
  }
}
function record(id: string, coop = summary()): ReplayRecord {
  return {
    id,
    profileHandle: handle,
    category: 'Coop',
    path: `D:\\${id}.SC2Replay`,
    fileName: `${id}.SC2Replay`,
    extension: '.sc2replay',
    sizeBytes: 1,
    mtimeMs: 1,
    contentHash: id,
    status: 'partial',
    supportLevel: 'metadata-only',
    mapName: null,
    playedAt: null,
    gameVersion: null,
    baseBuild: null,
    durationSeconds: null,
    players: [{ slot: 1, profileHandle: handle, name: 'Me', race: null, team: 1, result: 'win' }],
    warnings: [],
    coop,
  }
}
test('matches the account by unique profile, never array order or incompatible slot IDs', () => {
  const other = player({ profileHandle: '5-S2-1-999', commander: 'Kerrigan', slotId: 1 })
  const mine = player({ slotId: 7 })
  expect(replayCoopProfilePlayer(record('mine', summary([other, mine])))).toEqual(mine)
  expect(replayCoopProfilePlayer(record('missing', summary([other])))).toBeNull()
  expect(replayCoopProfilePlayer(record('ambiguous', summary([mine, mine])))).toBeNull()
  expect(
    replayCoopProfilePlayer(record('unknown', { ...summary(), identification: 'unknown' })),
  ).toBeNull()
})
test('groups confirmed summaries, preserves unknowns, deduplicates and excludes co-op matchups', () => {
  const mine = record('mine')
  const stats = buildReplayStatistics([
    mine,
    { ...mine, id: 'copy' },
    record('unknown', summary([player({ profileHandle: null })])),
    record('difficulty', { ...summary(), difficulty: null }),
    record('unconfirmed', { ...summary(), identification: 'unknown' }),
  ])
  expect(stats.duplicates).toBe(1)
  expect(stats.commanders.map(({ key, results }) => [key, results.total])).toEqual([
    ['Raynor', 2],
    [null, 1],
  ])
  expect(stats.difficulties.map(({ key, results }) => [key, results.total])).toEqual([
    [null, 1],
    ['4', 2],
  ])
  expect(stats.matchups).toEqual([])
})
test('uses matched account difficulty and never trusts corrupt commander data', () => {
  const stats = buildReplayStatistics([
    record('different', { ...summary([player({ difficulty: 3 })]), difficulty: null }),
    { ...record('corrupt'), status: 'corrupt' },
  ])
  expect(stats.difficulties.map(({ key, results }) => [key, results.total])).toEqual([
    [null, 1],
    ['3', 1],
  ])
  expect(stats.commanders.find(({ key }) => key === null)?.results.unknown).toBe(1)
})

test.each(['en', 'zh', 'zh-Hant'])(
  'renders raw supported values and explicit unavailable fields in %s',
  (locale) => {
    const wrapper = mount(ReplayCoopDetails, {
      props: { summary: summary([player({ prestige: 0 })]) },
      global: {
        plugins: [createI18n({ legacy: false, locale, messages: { en, zh, 'zh-Hant': zhHant } })],
      },
    })
    expect(wrapper.text()).not.toContain('replay.')
    expect(wrapper.text()).toContain('Raynor')
    expect(wrapper.findAll('dd').map((node) => node.text())).toContain('0')
    expect(wrapper.findAll('dd').map((node) => node.text())).not.toContain(
      locale === 'en' ? 'Unknown' : '未知',
    )
    expect(wrapper.find('table').exists()).toBe(false)
    wrapper.unmount()
  },
)
test('shows lifecycle counts and observed time without claiming rewards or completion', () => {
  const analysis: ReplayCoopAnalysis = {
    ...summary(),
    version: '1',
    bonusObjectives: {
      state: 'unknown',
      completionTimesSeconds: null,
      reason: 'No verified objective mapping',
    },
    upgrades: {
      state: 'partial',
      events: [
        {
          playerId: 0,
          upgradeId: '<mutatorinfoRaw>',
          count: 1,
          gameLoop: 160,
          seconds: 10,
          source: 'tracker-upgrade',
        },
      ],
    },
    mutators: {
      state: 'raw',
      ids: ['<mutatorinfoRaw>'],
      source: 'tracker-upgrade',
      completeness: 'unknown',
      evidence: {
        eventType: 'NNet.Replay.Tracker.SUpgradeEvent',
        playerId: 0,
        match: 'mutatorinfo-prefix',
      },
    },
    timeBasis: 'game-loops-16',
    units: {
      state: 'partial',
      corrections: 'lifecycle-only',
      unresolvedEvents: 2,
      counts: [
        { playerId: 3, unitType: '<Marine>', born: 2, started: 0, completed: 0, died: 1, kills: 0 },
      ],
    },
    timing: { state: 'available', observedGameLoops: 160, observedSeconds: 10 },
    rewards: { state: 'unknown', experience: null, bonusExperience: null },
    enemyComposition: { state: 'raw', raceIds: [1], waveTypeIds: [2] },
    damage: { state: 'unknown' },
    warnings: [],
  }
  const wrapper = mount(ReplayCoopDetails, {
    props: { analysis },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  expect(wrapper.text()).toContain('10 seconds')
  expect(wrapper.text()).not.toContain('not completion time')
  expect(wrapper.text()).not.toContain('2 unresolved events')
  expect(wrapper.text()).not.toContain('No verified objective mapping')
  expect(wrapper.text()).toContain('<mutatorinfoRaw>')
  expect(wrapper.text()).not.toContain('names and completeness unknown')
  expect(wrapper.find('mutatorinfoRaw').exists()).toBe(false)
  expect(wrapper.get('tbody').text()).toContain('<Marine>')
  expect(wrapper.find('marine').exists()).toBe(false)
  expect(wrapper.findAll('tbody td').map((node) => node.text())).toEqual([
    '#3',
    '2',
    '0',
    '0',
    '1',
    '0',
  ])
  wrapper.unmount()
})

test('unknown co-op settings alone do not render unsupported or empty fields', () => {
  const wrapper = mount(ReplayCoopDetails, {
    props: {
      summary: {
        identification: 'unknown',
        players: [player({ commander: null })],
        difficulty: null,
        mutators: { state: 'unknown', ids: null },
      },
    },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  expect(wrapper.text()).toContain(en['replay.analysisFailed'])
  expect(wrapper.find('dl').exists()).toBe(false)
  expect(wrapper.find('table').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('Unknown:')
  wrapper.unmount()
})
