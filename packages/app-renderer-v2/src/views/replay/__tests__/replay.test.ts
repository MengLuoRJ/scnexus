import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import ReplayView from '../ReplayView.vue'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import zhHant from '../../../locales/zh-Hant'

const mocks = vi.hoisted(() => ({
  list: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  scan: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  index: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  archive: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  delete: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  pick: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  toast: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  discover: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  duplicates: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  chooseExport: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  export: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  analyze: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getAnalysis: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  watch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('../../../ipcs', () => ({
  ipcReplayList: mocks.scan,
  ipcReplayScan: mocks.scan,
  ipcReplayImportFile: mocks.index,
  ipcReplayImportArchive: mocks.archive,
  ipcReplayDelete: mocks.delete,
  ipcDialogShowOpenDialog: mocks.pick,
  ipcReplayProfiles: mocks.discover,
  ipcReplayListDuplicates: mocks.duplicates,
  ipcReplayChooseExportPath: mocks.chooseExport,
  ipcReplayExportArchive: mocks.export,
  ipcReplayAnalyze: mocks.analyze,
  ipcReplayGetAnalysis: mocks.getAnalysis,
  ipcReplayWatch: mocks.watch,
}))
const scope = { profileHandle: '5-S2-1-2206060', category: 'Multiplayer' as const }
const profile = {
  accountId: '197562485',
  handle: scope.profileHandle,
  path: 'D:\\SC2\\Accounts\\197562485\\5-S2-1-2206060',
  replayPath: 'D:\\SC2\\Accounts\\197562485\\5-S2-1-2206060\\Replays',
}
const record: ReplayRecord = {
  profileHandle: scope.profileHandle,
  category: scope.category,
  id: '1',
  path: 'D:\\replays\\sample.SC2Replay',
  fileName: 'sample.SC2Replay',
  extension: '.sc2replay',
  sizeBytes: 2048,
  mtimeMs: 1,
  contentHash: null,
  status: 'partial',
  supportLevel: 'metadata-only',
  mapName: 'Test map',
  playedAt: null,
  gameVersion: null,
  baseBuild: null,
  durationSeconds: 90,
  players: [],
  warnings: ['Missing details'],
}
const button = defineComponent({
  props: ['label', 'disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
})
const input = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})
const modal = defineComponent({
  props: ['open', 'title', 'description'],
  template:
    '<div v-if="open" role="dialog"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body"/><slot name="footer"/></div>',
})
const wrappers: ReturnType<typeof mount>[] = []
async function render(_selectProfile = true, locale = 'en') {
  const wrapper = mount(ReplayView, {
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { en, zh, 'zh-Hant': zhHant } })],
      stubs: {
        Button: button,
        DropdownMenu: defineComponent({
          props: ['items'],
          data: () => ({ open: false }),
          template: `<div><div @click="open = !open"><slot /></div><div v-if="open" role="menu"><button v-for="item in items" :key="item.label" :disabled="item.disabled" @click="item.onSelect(); open = false">{{ item.label }}</button></div></div>`,
        }),
        Input: input,
        Select: defineComponent({
          props: ['modelValue', 'items', 'disabled'],
          emits: ['update:modelValue'],
          template:
            '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option value=""></option><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
        }),
        RouterLink: { template: '<a><slot /></a>' },
        Modal: modal,
        Badge: { template: '<span><slot /></span>' },
        Checkbox: defineComponent({
          props: ['modelValue', 'disabled'],
          emits: ['update:modelValue'],
          template:
            '<input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
        }),
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
async function click(wrapper: ReturnType<typeof mount>, label: string) {
  await wrapper
    .findAll('button')
    .find((item) => item.text() === label)!
    .trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mocks.scan.mockResolvedValue({ ok: true, data: [record] })
  for (const method of [mocks.index, mocks.archive, mocks.delete])
    method.mockResolvedValue({ ok: true, data: [] })
  mocks.pick.mockResolvedValue({ ok: true, data: { canceled: true, filePaths: [] } })
  mocks.discover.mockResolvedValue({ ok: true, data: [profile] })
  mocks.duplicates.mockResolvedValue({ ok: true, data: [] })
  mocks.chooseExport.mockResolvedValue({ ok: true, data: null })
  mocks.getAnalysis.mockResolvedValue({ ok: true, data: null })
  mocks.watch.mockResolvedValue({ ok: true, data: undefined })
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

test('watching from details launches the selected replay without parsing and blocks duplicate actions', async () => {
  let finish!: (value: unknown) => void
  mocks.watch.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const wrapper = await render()
  await click(wrapper, 'Details')
  await click(wrapper, 'Watch replay')
  expect(mocks.watch).toHaveBeenCalledExactlyOnceWith(scope, record.id)
  expect(mocks.analyze).not.toHaveBeenCalled()
  expect(
    wrapper
      .get('[role="dialog"]')
      .findAll('button')
      .every((button) => button.attributes('disabled') !== undefined),
  ).toBe(true)
  finish({ ok: true, data: undefined })
  await flushPromises()
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: en['replay.watchStarted'], color: 'success' }),
  )
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
})

test('watch launch failures produce a toast and leave details open for retry', async () => {
  mocks.watch.mockResolvedValueOnce({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.GAME_LAUNCH_FAILED)),
  })
  const wrapper = await render()
  await click(wrapper, 'Details')
  await click(wrapper, 'Watch replay')
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  await click(wrapper, 'Watch replay')
  expect(mocks.watch).toHaveBeenCalledTimes(2)
})

test('statistics include all current profile records while returning preserves list search', async () => {
  mocks.scan.mockResolvedValue({
    ok: true,
    data: [
      record,
      {
        ...record,
        id: '2',
        fileName: 'other.SC2Replay',
        mapName: 'Other map',
        contentHash: 'another',
      },
    ],
  })
  const wrapper = await render()
  await wrapper.get('input:not([type="checkbox"])').setValue('Test map')
  expect(wrapper.findAll('article')).toHaveLength(1)
  await click(wrapper, 'Match statistics')
  expect(wrapper.text()).toContain('Other map')
  await click(wrapper, 'Back to replays')
  expect(wrapper.get('input:not([type="checkbox"])').element).toHaveProperty('value', 'Test map')
  expect(wrapper.findAll('article')).toHaveLength(1)
  expect(wrapper.get('article').text()).toContain('Test map')
})

test('loads indexed records, exposes partial metadata honestly and filters search', async () => {
  const wrapper = await render()
  expect(mocks.scan).toHaveBeenCalledOnce()
  expect(wrapper.get('article').text()).toContain('Test map')
  expect(
    wrapper
      .get('article')
      .findAll('button')
      .map((button) => button.text()),
  ).toEqual(['Details'])
  expect(wrapper.text()).not.toContain('Missing details')
  await click(wrapper, 'Details')
  expect(wrapper.text()).not.toContain('Metadata only')
  expect(wrapper.text()).toContain('Unknown')
  expect(wrapper.text()).not.toContain('Missing details')
  expect(wrapper.text()).toContain('1:30')
  await click(wrapper, 'Close')
  await wrapper.get('input').setValue('test MAP')
  expect(wrapper.findAll('article')).toHaveLength(1)
  await wrapper.get('input').setValue('not present')
  expect(wrapper.text()).toContain('No matching replays.')
  expect(wrapper.findAll('article')).toHaveLength(0)
  expect(mocks.scan).toHaveBeenCalledExactlyOnceWith(scope)
})
test('shows escaped player metadata without technical build or result prefixes', async () => {
  mocks.scan.mockResolvedValueOnce({
    ok: true,
    data: [
      {
        ...record,
        baseBuild: 97364,
        players: [
          { slot: 0, name: '<b>SC2 player</b>', race: 'Terran', team: 1, result: 'win' },
          { slot: 1, name: 'Opponent', race: 'Zerg', team: 2, result: 'loss' },
          { slot: 2, name: 'Ally', race: 'Protoss', team: 1, result: 'draw' },
          { slot: 3, name: null, race: null, team: null, result: null },
        ],
      },
    ],
  })
  const wrapper = await render()
  const article = wrapper.get('article')
  expect(article.text()).not.toContain('Base build: 97364')
  expect(article.get('p').attributes('title')).toContain(
    '<b>SC2 player</b> (Terran) / Opponent (Zerg) / Ally (Protoss) / Unknown (Unknown)',
  )
  await click(wrapper, 'Details')
  const dialog = wrapper.get('[role="dialog"]')
  expect(dialog.text()).not.toContain('Base build: 97364')
  expect(article.text()).toContain('<b>SC2 player</b>')
  expect(article.find('b').exists()).toBe(false)
  const players = dialog.findAll('li')
  expect(players[0]!.text()).toContain('(Terran)')
  expect(players[0]!.text()).toContain('Team: 1')
  expect(players[0]!.text()).toContain('Win')
  expect(players[1]!.text()).toContain('(Zerg)')
  expect(players[1]!.text()).toContain('Loss')
  expect(players[2]!.text()).toContain('(Protoss)')
  expect(players[2]!.text()).toContain('Draw')
  expect(players[3]!.text()).toContain('(Unknown)')
  expect(players[3]!.text()).toContain('Team: Unknown')
  expect(players[3]!.text()).toContain('Unknown')
})
test('compact cards keep long multiplayer summaries on one truncated row and show real local match time', async () => {
  const playedAt = '2025-06-15T14:35:22.000Z'
  const players = Array.from({ length: 16 }, (_, slot) => ({
    slot,
    name: `Player ${slot} ${'long name '.repeat(20)}`,
    race: 'Terran',
    team: slot + 1,
    result: slot % 2 ? 'loss' : 'win',
  }))
  mocks.scan.mockResolvedValueOnce({
    ok: true,
    data: [{ ...record, playedAt, mapName: 'Map '.repeat(100), players }],
  })
  const wrapper = await render()
  const card = wrapper.get('article')
  expect(card.findAll('p')).toHaveLength(1)
  expect(card.get('p').classes()).toContain('truncate')
  expect(card.get('h2').classes()).toContain('truncate')
  expect(card.get('p').attributes('title')).toContain(players[15]!.name)
  expect(card.get('p').attributes('title')).toContain('Terran)')
  expect(card.get('time').attributes('datetime')).toBe(playedAt)
  expect(card.get('time').text()).toBe(new Date(playedAt).toLocaleString('en'))
  expect(card.text()).not.toContain(record.fileName)
  expect(card.text()).not.toContain(record.path)
  expect(card.findAll('button')).toHaveLength(1)
  await click(wrapper, 'Details')
  expect(wrapper.get('[role="dialog"]').text()).toContain(new Date(playedAt).toLocaleString('en'))
  expect(wrapper.get('[role="dialog"]').text()).toContain('File modified at')
  expect(mocks.analyze).not.toHaveBeenCalled()
})

test('requires physical deletion confirmation and cancellation does nothing', async () => {
  const wrapper = await render()
  await click(wrapper, 'Details')
  await click(wrapper, 'Delete')
  expect(wrapper.get('[role="dialog"]').text()).toContain(
    'permanently deletes the replay file from disk',
  )
  expect(mocks.delete).not.toHaveBeenCalled()
  expect(wrapper.findAll('[role="dialog"]')).toHaveLength(1)
  expect(wrapper.find('[role="dialog"]').text()).not.toContain('Analyze')
  await click(wrapper, 'Cancel')
  expect(mocks.delete).not.toHaveBeenCalled()
  await click(wrapper, 'Details')
  await click(wrapper, 'Delete')
  await click(wrapper, 'Delete permanently')
  expect(mocks.delete).toHaveBeenCalledExactlyOnceWith(scope, record.id)
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})
test('failed deletion keeps confirmation and indexed record, showing error toast', async () => {
  const wrapper = await render()
  mocks.delete.mockResolvedValueOnce({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.IPC_TRANSPORT_FAILED)),
  })
  await click(wrapper, 'Details')
  await click(wrapper, 'Delete')
  await click(wrapper, 'Delete permanently')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  expect(wrapper.findAll('article')).toHaveLength(1)
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  expect(mocks.scan).toHaveBeenCalledOnce()
})
test('load failure is not presented as an empty library and can be retried', async () => {
  mocks.scan.mockResolvedValueOnce({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.IPC_TRANSPORT_FAILED)),
  })
  const wrapper = await render()
  expect(wrapper.text()).not.toContain('No replays in this profile and type.')
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  mocks.scan.mockResolvedValueOnce({ ok: true, data: [] })
  await click(wrapper, 'Refresh')
  expect(wrapper.text()).toContain('No replays in this profile and type.')
})
test('export mode is explicit, keeps selection across search and exports scoped IDs', async () => {
  const other = { ...record, id: '2', fileName: 'other.SC2Replay', path: 'D:\\other.SC2Replay' }
  mocks.scan.mockResolvedValue({ ok: true, data: [record, other] })
  const wrapper = await render()
  expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  for (const label of [
    'Export ZIP',
    'Clear',
    'Select visible',
    'Selected:',
    'Refresh profiles',
    'Show duplicates',
  ])
    expect(wrapper.text()).not.toContain(label)
  expect(mocks.duplicates).not.toHaveBeenCalled()
  await click(wrapper, 'Multi-select export')
  await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true)
  await wrapper.get('input:not([type="checkbox"])').setValue('sample')
  expect(wrapper.findAll('article')).toHaveLength(1)
  expect(wrapper.text()).toContain('Selected: 1')
  await click(wrapper, 'Export ZIP')
  expect(mocks.export).not.toHaveBeenCalled()
  mocks.chooseExport.mockResolvedValueOnce({ ok: true, data: 'D:\\out.zip' })
  mocks.export.mockResolvedValueOnce({ ok: true, data: { path: 'D:\\out.zip', count: 1 } })
  await click(wrapper, 'Export ZIP')
  expect(mocks.export).toHaveBeenCalledExactlyOnceWith(scope, ['2'], 'D:\\out.zip')
  await click(wrapper, 'Clear')
  await click(wrapper, 'Select visible')
  expect(wrapper.text()).toContain('Selected: 1')
  await click(wrapper, 'Cancel')
  expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('Export ZIP')
  await click(wrapper, 'Multi-select export')
  expect(wrapper.text()).toContain('Selected: 0')
})

test('failed export preserves selection and reports failure without refreshing or deleting', async () => {
  const wrapper = await render()
  await click(wrapper, 'Multi-select export')
  await wrapper.get('input[type="checkbox"]').setValue(true)
  mocks.chooseExport.mockResolvedValueOnce({ ok: true, data: 'D:\\existing.zip' })
  mocks.export.mockResolvedValueOnce({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.IPC_TRANSPORT_FAILED)),
  })
  await click(wrapper, 'Export ZIP')
  expect(wrapper.text()).toContain('Selected: 1')
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  expect(mocks.scan).toHaveBeenCalledOnce()
  expect(mocks.delete).not.toHaveBeenCalled()
})

test('viewing saved analysis never starts parsing; null and failure stay distinct', async () => {
  const wrapper = await render()
  await click(wrapper, 'Details')
  expect(mocks.getAnalysis).toHaveBeenCalledExactlyOnceWith(scope, '1')
  expect(mocks.analyze).not.toHaveBeenCalled()
  expect(wrapper.get('[role="dialog"]').text()).toContain('No match insights are available')
  await click(wrapper, 'Close')
  mocks.getAnalysis.mockResolvedValueOnce({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.IPC_TRANSPORT_FAILED)),
  })
  await click(wrapper, 'Details')
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect(wrapper.get('[role="dialog"]').text()).toContain(record.path)
  expect(wrapper.get('[role="dialog"]').text()).not.toContain('Missing details')
  expect(wrapper.get('[role="dialog"]').text()).not.toContain('No match insights are available')
})

test('details show metadata while saved analysis loads without starting analysis', async () => {
  let finish!: (value: unknown) => void
  mocks.getAnalysis.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const wrapper = await render()
  await click(wrapper, 'Details')
  const dialog = wrapper.get('[role="dialog"]')
  expect(dialog.text()).toContain(record.fileName)
  expect(dialog.text()).toContain(record.path)
  expect(dialog.text()).toContain('Test map')
  expect(dialog.text()).toContain('2.0 KiB')
  expect(dialog.text()).not.toContain('Missing details')
  expect(dialog.find('[role="status"]').exists()).toBe(true)
  expect(
    dialog.findAll('button').every((button) => button.attributes('disabled') !== undefined),
  ).toBe(true)
  expect(mocks.analyze).not.toHaveBeenCalled()
  finish({ ok: true, data: null })
  await flushPromises()
  expect(dialog.text()).toContain('No match insights are available')
})

test('manual analysis hides technical results and asks to analyze old raw-only caches', async () => {
  mocks.getAnalysis.mockResolvedValueOnce({
    ok: true,
    data: {
      status: 'unsupported',
      parserVersion: 'private-parser',
      contentHash: 'private-hash',
      baseBuild: 99999,
      warnings: ['raw backend warning'],
      components: { tracker: { protocolVersion: 'private-protocol', events: [] } },
    },
  })
  const wrapper = await render()
  await click(wrapper, 'Details')
  expect(mocks.analyze).not.toHaveBeenCalled()
  const dialog = wrapper.get('[role="dialog"]')
  expect(dialog.text()).toContain('Analysis was attempted')
  for (const text of [
    'private-parser',
    'private-hash',
    '99999',
    'raw backend warning',
    'private-protocol',
    'unsupported',
    'Result:',
  ])
    expect(dialog.text()).not.toContain(text)
  expect(dialog.find('pre').exists()).toBe(false)
  mocks.analyze.mockResolvedValueOnce({
    ok: true,
    data: { insights: { version: '1', timeBasis: 'game-loops-16', players: [] } },
  })
  await click(wrapper, 'Reanalyze')
  expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(scope, '1')
  expect(dialog.text()).toContain('No participant insights')
})

const sample = (gameLoop: number, minerals: number | null) => ({
  gameLoop,
  minerals,
  vespene: 20,
  mineralIncome: 700,
  vespeneIncome: 90,
  workers: null,
  supplyUsed: null,
  supplyCap: null,
  armyMinerals: null,
  armyVespene: null,
})

test('renders actual economy fields, missing snapshots and bounded escaped production by player ID', async () => {
  mocks.getAnalysis.mockResolvedValueOnce({
    ok: true,
    data: {
      capabilities: {
        tracker: { state: 'partial', decoder: 'tracker-versioned-v1', sourceBuild: 99999 },
      },
      insights: {
        version: '1',
        timeBasis: 'game-loops-16',
        players: [
          {
            playerId: 7,
            slot: 0,
            name: '&lt;b&gt;Player&lt;/b&gt;',
            economy: [sample(160, 50), sample(320, null), sample(480, 300)],
            production: Array.from({ length: 45 }, (_, i) => ({
              gameLoop: i * 16,
              kind: i === 0 ? 'construction-started' : 'unit-born',
              name: '<img src=x>',
              count: null,
            })),
          },
          {
            playerId: 2,
            slot: 1,
            name: 'Other',
            economy: [{ ...sample(160, 999), workers: 24, supplyUsed: 42, supplyCap: 60 }],
            production: [],
          },
        ],
      },
    },
  })
  const wrapper = await render()
  await click(wrapper, 'Details')
  const dialog = wrapper.get('[role="dialog"]')
  expect(dialog.text()).toContain('<b>Player</b>')
  expect(dialog.text()).toContain('may be incomplete')
  expect(dialog.text()).not.toContain('tracker-versioned-v1')
  expect(dialog.find('b').exists()).toBe(false)
  expect(dialog.find('img').exists()).toBe(false)
  expect(dialog.findAll('svg[role="img"]')).toHaveLength(3)
  expect(dialog.findAll('svg[role="img"]')[0]!.text()).toContain('0:10: 50')
  expect(dialog.findAll('svg[role="img"]')[1]!.text()).toMatch(
    /Minerals \/ minute[\s\S]*0:10:[\s\S]*700/,
  )
  expect(dialog.text()).toContain('999')
  expect(dialog.text()).toContain('Production started')
  expect(dialog.text()).not.toContain('Construction started')
  expect(dialog.get('ol').findAll('li')).toHaveLength(20)
  expect(dialog.text()).toContain('1 / 3')
  await click(wrapper, 'Next')
  await click(wrapper, 'Next')
  expect(dialog.get('ol').findAll('li')).toHaveLength(5)
  expect(dialog.text()).toContain('3 / 3')
  await dialog.get('select').setValue('2')
  expect(dialog.findAll('svg[role="img"]')).toHaveLength(3)
  expect(dialog.text()).toContain('999')
  expect(dialog.text()).toMatch(/Workers[\s\S]*0:10:[\s\S]*24/)
  expect(dialog.text()).toContain('No production records')
  expect(dialog.find('ol').exists()).toBe(false)
  expect(mocks.analyze).not.toHaveBeenCalled()
})

test('selects first profile and switches categories with immediate scoped reads and cleared selection', async () => {
  const wrapper = await render(false)
  expect(mocks.scan).toHaveBeenCalledExactlyOnceWith(scope)
  expect(wrapper.findAll('article')).toHaveLength(1)
  await click(wrapper, 'Multi-select export')
  await wrapper.get('input[type="checkbox"]').setValue(true)
  mocks.scan.mockResolvedValueOnce({ ok: true, data: [] })
  await wrapper.findAll('select')[1]!.setValue('Campaign')
  await flushPromises()
  expect(mocks.scan).toHaveBeenLastCalledWith({ ...scope, category: 'Campaign' })
  expect(wrapper.findAll('article')).toHaveLength(0)
  expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  await click(wrapper, 'Multi-select export')
  expect(wrapper.text()).toContain('Selected: 0')
  expect(mocks.analyze).not.toHaveBeenCalled()
})

test('profile switching never displays or exports the previous profile selection', async () => {
  mocks.discover.mockResolvedValue({
    ok: true,
    data: [profile, { ...profile, handle: '1-S2-1-999' }],
  })
  const wrapper = await render()
  await click(wrapper, 'Multi-select export')
  await wrapper.get('input[type="checkbox"]').setValue(true)
  mocks.scan.mockResolvedValueOnce({ ok: true, data: [] })
  await wrapper.findAll('select')[0]!.setValue('1-S2-1-999')
  await flushPromises()
  expect(mocks.scan).toHaveBeenLastCalledWith({
    profileHandle: '1-S2-1-999',
    category: 'Multiplayer',
  })
  expect(wrapper.findAll('article')).toHaveLength(0)
  expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  await click(wrapper, 'Multi-select export')
  expect(wrapper.text()).toContain('Selected: 0')
  expect(mocks.export).not.toHaveBeenCalled()
})

test('imports require a selected destination scope and cancellation does not copy', async () => {
  const wrapper = await render()
  await click(wrapper, 'Import')
  await click(wrapper, 'Import replay')
  await click(wrapper, 'Import')
  await click(wrapper, 'Import archive')
  expect(mocks.index).not.toHaveBeenCalled()
  expect(mocks.archive).not.toHaveBeenCalled()
  mocks.pick.mockResolvedValueOnce({
    ok: true,
    data: { canceled: false, filePaths: ['D:\\outside.SC2Replay'] },
  })
  await click(wrapper, 'Import')
  await click(wrapper, 'Import replay')
  expect(mocks.index).toHaveBeenCalledWith(scope, 'D:\\outside.SC2Replay')
  mocks.pick.mockResolvedValueOnce({
    ok: true,
    data: { canceled: false, filePaths: ['D:\\pack.zip'] },
  })
  await click(wrapper, 'Import')
  await click(wrapper, 'Import archive')
  expect(mocks.archive).toHaveBeenCalledWith(scope, 'D:\\pack.zip')
  expect(mocks.pick).toHaveBeenCalledTimes(4)
})

test('no detected profiles disables imports and points to settings without global records', async () => {
  mocks.discover.mockResolvedValue({ ok: true, data: [] })
  const wrapper = await render(false)
  expect(wrapper.text()).toContain('No StarCraft profiles found')
  expect(wrapper.findAll('article')).toHaveLength(0)
  expect(mocks.scan).not.toHaveBeenCalled()
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === 'Import')!
      .attributes('disabled'),
  ).toBeDefined()
})

test('existing indexed SC2 names display safely in list, results, search and details without reindex', async () => {
  mocks.scan.mockResolvedValueOnce({
    ok: true,
    data: [
      {
        ...record,
        players: [
          {
            slot: 0,
            name: '&lt;ACNet&gt;<sp/>MengLuoRJ',
            profileHandle: scope.profileHandle,
            race: 'Protoss',
            team: 1,
            result: 'win',
          },
          {
            slot: 1,
            name: '&lt;img src=x onerror=alert(1)&gt;',
            race: 'Terran',
            team: 2,
            result: 'loss',
          },
        ],
      },
    ],
  })
  const wrapper = await render()
  const card = wrapper.get('article')
  expect(card.get('p').text()).toContain('<ACNet> MengLuoRJ (Protoss)')
  expect(card.get('.text-success').text()).toBe('Win')
  expect(card.find('.text-error').exists()).toBe(false)
  expect(card.find('img').exists()).toBe(false)
  expect(card.find('acnet').exists()).toBe(false)
  const grid = card.get('.grid')
  expect(grid.classes()).toContain('grid-rows-2')
  expect(grid.element.children[1]!.textContent).toBe('Win')
  expect(grid.element.children[3]!.querySelector('time')).not.toBeNull()
  await wrapper.get('input').setValue('<ACNet> MengLuoRJ')
  expect(wrapper.findAll('article')).toHaveLength(1)
  await click(wrapper, 'Details')
  expect(wrapper.get('[role="dialog"]').text()).toContain('<ACNet> MengLuoRJ (Protoss)')
  const detailPlayers = wrapper.get('[role="dialog"]').findAll('li')
  expect(detailPlayers[0]!.find('.font-semibold').exists()).toBe(true)
  expect(detailPlayers[1]!.find('.font-semibold').exists()).toBe(false)
  expect(wrapper.get('[role="dialog"]').find('img').exists()).toBe(false)
  expect(mocks.index).not.toHaveBeenCalled()
})

test('header actions are ordered and disabled while loading or without a scope', async () => {
  const wrapper = await render(false)
  const actions = wrapper.findAll('button')
  expect(actions.slice(0, 3).map((button) => button.text())).toEqual([
    'Refresh',
    'Import',
    'Multi-select export',
  ])
  expect(actions.slice(0, 3).every((button) => button.attributes('disabled') === undefined)).toBe(
    true,
  )
  await click(wrapper, 'Multi-select export')
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === 'Export ZIP')!
      .attributes('disabled'),
  ).toBeDefined()
  let finish!: (value: unknown) => void
  mocks.scan.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await click(wrapper, 'Refresh')
  expect(
    wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined),
  ).toBe(true)
  expect(wrapper.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
  finish({ ok: true, data: [record] })
  await flushPromises()
})

test.each([
  ['zh', '多选导出', '选择可见项', 'MengLuoRJ（星灵）'],
  ['zh-Hant', '多選導出', '選擇可見項', 'MengLuoRJ（星靈）'],
])('localizes export controls and race suffix in %s', async (locale, toggle, select, player) => {
  mocks.scan.mockResolvedValueOnce({
    ok: true,
    data: [
      {
        ...record,
        players: [{ slot: 0, name: 'MengLuoRJ', race: 'Protoss', team: 1, result: 'win' }],
      },
    ],
  })
  const wrapper = await render(true, locale)
  expect(wrapper.get('article p').text()).toBe(player)
  await click(wrapper, toggle)
  expect(wrapper.text()).toContain(select)
})

test('restores renderer profile and category across page mounts', async () => {
  mocks.discover.mockResolvedValue({
    ok: true,
    data: [profile, { ...profile, handle: '1-S2-1-999' }],
  })
  const first = await render()
  await first.findAll('select')[0]!.setValue('1-S2-1-999')
  await flushPromises()
  await first.findAll('select')[1]!.setValue('Challenge')
  await flushPromises()
  first.unmount()
  mocks.scan.mockClear()
  const second = await render()
  expect(mocks.scan).toHaveBeenCalledExactlyOnceWith({
    profileHandle: '1-S2-1-999',
    category: 'Challenge',
  })
  expect((second.findAll('select')[0]!.element as HTMLSelectElement).value).toBe('1-S2-1-999')
  expect((second.findAll('select')[1]!.element as HTMLSelectElement).value).toBe('Challenge')
})

test('missing saved profile falls back to first available without leaking prior records', async () => {
  localStorage.setItem(
    'scnexus.replay.selection',
    JSON.stringify({ profileHandle: '1-S2-1-999', category: 'Campaign' }),
  )
  await render()
  expect(mocks.scan).toHaveBeenCalledExactlyOnceWith({ ...scope, category: 'Campaign' })
  expect(JSON.parse(localStorage.getItem('scnexus.replay.selection')!).profileHandle).toBe(
    scope.profileHandle,
  )
})
