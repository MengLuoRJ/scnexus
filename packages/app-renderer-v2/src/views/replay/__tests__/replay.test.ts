import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import ReplayView from '../ReplayView.vue'
import en from '../../../locales/en'

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
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('../../../ipcs', () => ({
  ipcReplayList: mocks.list,
  ipcReplayScanDirectory: mocks.scan,
  ipcReplayIndexFile: mocks.index,
  ipcReplayImportArchive: mocks.archive,
  ipcReplayDelete: mocks.delete,
  ipcDialogShowOpenDialog: mocks.pick,
  ipcReplayDiscoverDirectories: mocks.discover,
  ipcReplayListDuplicates: mocks.duplicates,
  ipcReplayChooseExportPath: mocks.chooseExport,
  ipcReplayExportArchive: mocks.export,
  ipcReplayAnalyze: mocks.analyze,
  ipcReplayGetAnalysis: mocks.getAnalysis,
}))
const record: ReplayRecord = {
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
async function render() {
  const wrapper = mount(ReplayView, {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      stubs: {
        Button: button,
        Input: input,
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
  mocks.list.mockResolvedValue({ ok: true, data: [record] })
  for (const method of [mocks.scan, mocks.index, mocks.archive, mocks.delete])
    method.mockResolvedValue({ ok: true, data: [] })
  mocks.pick.mockResolvedValue({ ok: true, data: { canceled: true, filePaths: [] } })
  mocks.discover.mockResolvedValue({ ok: true, data: [] })
  mocks.duplicates.mockResolvedValue({ ok: true, data: [] })
  mocks.chooseExport.mockResolvedValue({ ok: true, data: null })
  mocks.getAnalysis.mockResolvedValue({ ok: true, data: null })
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

test('loads indexed records, exposes partial metadata honestly and filters search', async () => {
  const wrapper = await render()
  expect(mocks.list).toHaveBeenCalledOnce()
  expect(wrapper.get('article').text()).toContain('Test map')
  expect(
    wrapper
      .get('article')
      .findAll('button')
      .map((button) => button.text()),
  ).toEqual(['Details'])
  expect(wrapper.text()).not.toContain('Missing details')
  await click(wrapper, 'Details')
  expect(wrapper.text()).toContain('Metadata only')
  expect(wrapper.text()).toContain('Unknown')
  expect(wrapper.text()).toContain('Missing details')
  expect(wrapper.text()).toContain('1:30')
  await click(wrapper, 'Close')
  await wrapper.get('input').setValue('test MAP')
  expect(wrapper.findAll('article')).toHaveLength(1)
  await wrapper.get('input').setValue('not present')
  expect(wrapper.text()).toContain('No matching replays.')
  expect(wrapper.findAll('article')).toHaveLength(0)
  expect(mocks.scan).not.toHaveBeenCalled()
})
test('shows player metadata and base build as escaped text, preserving unknown values', async () => {
  mocks.list.mockResolvedValueOnce({
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
    '<b>SC2 player</b> · Terran · Win / Opponent · Zerg · Loss / Ally · Protoss · Draw / Unknown · Unknown · Unknown',
  )
  await click(wrapper, 'Details')
  const dialog = wrapper.get('[role="dialog"]')
  expect(dialog.text()).toContain('Base build: 97364')
  expect(article.text()).toContain('<b>SC2 player</b>')
  expect(article.find('b').exists()).toBe(false)
  const players = dialog.findAll('li')
  expect(players[0]!.text()).toContain('Race: Terran')
  expect(players[0]!.text()).toContain('Team: 1')
  expect(players[0]!.text()).toContain('Result: Win')
  expect(players[1]!.text()).toContain('Race: Zerg')
  expect(players[1]!.text()).toContain('Result: Loss')
  expect(players[2]!.text()).toContain('Race: Protoss')
  expect(players[2]!.text()).toContain('Result: Draw')
  expect(players[3]!.text()).toContain('Race: Unknown')
  expect(players[3]!.text()).toContain('Team: Unknown')
  expect(players[3]!.text()).toContain('Result: Unknown')
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
  mocks.list.mockResolvedValueOnce({
    ok: true,
    data: [{ ...record, playedAt, mapName: 'Map '.repeat(100), players }],
  })
  const wrapper = await render()
  const card = wrapper.get('article')
  expect(card.findAll('p')).toHaveLength(1)
  expect(card.get('p').classes()).toContain('truncate')
  expect(card.get('h2').classes()).toContain('truncate')
  expect(card.get('p').attributes('title')).toContain(players[15]!.name)
  expect(card.get('p').attributes('title')).toContain('Terran · Loss')
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

test('cancellation never indexes, scans, imports, or emits success', async () => {
  const wrapper = await render()
  for (const label of ['Scan directory', 'Add replay', 'Import archive'])
    await click(wrapper, label)
  expect(mocks.scan).not.toHaveBeenCalled()
  expect(mocks.index).not.toHaveBeenCalled()
  expect(mocks.archive).not.toHaveBeenCalled()
  mocks.pick.mockResolvedValueOnce({
    ok: true,
    data: { canceled: false, filePaths: ['D:\\pack.zip'] },
  })
  await click(wrapper, 'Import archive')
  expect(mocks.archive).not.toHaveBeenCalled()
  expect(mocks.toast).not.toHaveBeenCalled()
})
test('manual actions use selected paths and reload after completion', async () => {
  const wrapper = await render()
  const picked = (path: string) => ({ ok: true, data: { canceled: false, filePaths: [path] } })
  mocks.pick.mockResolvedValueOnce(picked('D:\\replays'))
  await click(wrapper, 'Scan directory')
  expect(mocks.scan).toHaveBeenCalledWith('D:\\replays')
  mocks.pick.mockResolvedValueOnce(picked(record.path))
  await click(wrapper, 'Add replay')
  expect(mocks.index).toHaveBeenCalledWith(record.path)
  mocks.pick
    .mockResolvedValueOnce(picked('D:\\pack.zip'))
    .mockResolvedValueOnce(picked('D:\\destination'))
  await click(wrapper, 'Import archive')
  expect(mocks.archive).toHaveBeenCalledWith('D:\\pack.zip', 'D:\\destination')
  expect(mocks.list).toHaveBeenCalledTimes(4)
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
  expect(wrapper.find('[role="dialog"]').text()).not.toContain('Analyze components')
  await click(wrapper, 'Cancel')
  expect(mocks.delete).not.toHaveBeenCalled()
  await click(wrapper, 'Details')
  await click(wrapper, 'Delete')
  await click(wrapper, 'Delete permanently')
  expect(mocks.delete).toHaveBeenCalledExactlyOnceWith(record.path)
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
  expect(mocks.list).toHaveBeenCalledOnce()
})
test('load failure is not presented as an empty library and can be retried', async () => {
  mocks.list.mockResolvedValueOnce({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.IPC_TRANSPORT_FAILED)),
  })
  const wrapper = await render()
  expect(wrapper.text()).not.toContain('No indexed replays.')
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  mocks.list.mockResolvedValueOnce({ ok: true, data: [] })
  await click(wrapper, 'Refresh')
  expect(wrapper.text()).toContain('No indexed replays.')
})
test('directory discovery never scans until explicitly selected', async () => {
  const wrapper = await render()
  expect(mocks.discover).not.toHaveBeenCalled()
  mocks.discover.mockResolvedValueOnce({
    ok: true,
    data: [{ path: 'D:\\SC2\\Replays', account: '1', profile: '1-S2-1-2' }],
  })
  await click(wrapper, 'Find directories')
  expect(wrapper.text()).toContain('D:\\SC2\\Replays')
  expect(mocks.scan).not.toHaveBeenCalled()
  await click(wrapper, 'Scan this directory')
  expect(mocks.scan).toHaveBeenCalledExactlyOnceWith('D:\\SC2\\Replays')
})

test('duplicate filter marks records, preserves selection across search, and exports explicit IDs', async () => {
  const other = { ...record, id: '2', fileName: 'other.SC2Replay' }
  mocks.list.mockResolvedValue({ ok: true, data: [record, other] })
  mocks.duplicates.mockResolvedValue({
    ok: true,
    data: [{ contentHash: 'same', replays: [record] }],
  })
  const wrapper = await render()
  await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true)
  await click(wrapper, 'Show duplicates')
  expect(wrapper.findAll('article')).toHaveLength(1)
  expect(wrapper.get('article').text()).toContain('Duplicate content')
  expect(wrapper.text()).toContain('Selected: 1')
  await click(wrapper, 'Export ZIP')
  expect(mocks.export).not.toHaveBeenCalled()
  mocks.chooseExport.mockResolvedValueOnce({ ok: true, data: 'D:\\out.zip' })
  mocks.export.mockResolvedValueOnce({ ok: true, data: { path: 'D:\\out.zip', count: 1 } })
  await click(wrapper, 'Export ZIP')
  expect(mocks.export).toHaveBeenCalledExactlyOnceWith(['2'], 'D:\\out.zip')
  expect(mocks.delete).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Exported 1 replays', description: 'D:\\out.zip' }),
  )
  await click(wrapper, 'Clear')
  expect(wrapper.text()).toContain('Selected: 0')
})

test('failed export preserves selection and reports failure without refreshing or deleting', async () => {
  const wrapper = await render()
  await wrapper.get('input[type="checkbox"]').setValue(true)
  mocks.chooseExport.mockResolvedValueOnce({ ok: true, data: 'D:\\existing.zip' })
  mocks.export.mockResolvedValueOnce({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.IPC_TRANSPORT_FAILED)),
  })
  await click(wrapper, 'Export ZIP')
  expect(wrapper.text()).toContain('Selected: 1')
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  expect(mocks.list).toHaveBeenCalledOnce()
  expect(mocks.delete).not.toHaveBeenCalled()
})

test('viewing saved analysis never starts parsing; null and failure stay distinct', async () => {
  const wrapper = await render()
  await click(wrapper, 'Details')
  expect(mocks.getAnalysis).toHaveBeenCalledExactlyOnceWith('1')
  expect(mocks.analyze).not.toHaveBeenCalled()
  expect(wrapper.get('[role="dialog"]').text()).toContain('No current saved analysis')
  await click(wrapper, 'Close')
  mocks.getAnalysis.mockResolvedValueOnce({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.IPC_TRANSPORT_FAILED)),
  })
  await click(wrapper, 'Details')
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect(wrapper.get('[role="dialog"]').text()).toContain(record.path)
  expect(wrapper.get('[role="dialog"]').text()).toContain('Missing details')
  expect(wrapper.get('[role="dialog"]').text()).not.toContain('No current saved analysis')
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
  expect(dialog.text()).toContain('Missing details')
  expect(dialog.find('[role="status"]').exists()).toBe(true)
  expect(
    dialog.findAll('button').every((button) => button.attributes('disabled') !== undefined),
  ).toBe(true)
  expect(mocks.analyze).not.toHaveBeenCalled()
  finish({ ok: true, data: null })
  await flushPromises()
  expect(dialog.text()).toContain('No current saved analysis')
})

test('manual component analysis opens saved result with honest partial status', async () => {
  const wrapper = await render()
  mocks.analyze.mockResolvedValueOnce({
    ok: true,
    data: {
      replayId: '1',
      contentHash: 'abc',
      parserVersion: 'components-1.0.0',
      baseBuild: 99999,
      status: 'partial',
      warnings: ['Unsupported replay base build: 99999'],
      analyzedAt: '2026-10-31',
      components: {
        initData: null,
        tracker: null,
        attributes: { protocolVersion: 'attributes-v1', attributes: [] },
      },
    },
  })
  await click(wrapper, 'Details')
  await click(wrapper, 'Analyze components')
  expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith('1')
  expect(wrapper.get('[role="dialog"]').text()).toContain('Partially decoded')
  expect(wrapper.text()).toContain('Unsupported replay base build: 99999')
  expect(wrapper.text()).toContain('not APM')
  await click(wrapper, 'Attributes')
  expect(wrapper.text()).toContain('no records in this component')
  await click(wrapper, 'Close')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})

test('tracker details paginate raw events and safely escape replay text', async () => {
  mocks.getAnalysis.mockResolvedValueOnce({
    ok: true,
    data: {
      replayId: '1',
      contentHash: 'hash',
      parserVersion: 'v1',
      baseBuild: 70154,
      status: 'completed',
      warnings: [],
      analyzedAt: 'today',
      components: {
        initData: null,
        attributes: null,
        tracker: {
          protocolVersion: 's2protocol-70154',
          algorithmVersion: '1.0.0',
          events: Array.from({ length: 45 }, (_, i) => ({
            eventType: '<b>UnitBorn</b>',
            gameLoop: i,
            data: { name: '<img src=x onerror=alert(1)>' },
          })),
        },
      },
    },
  })
  const wrapper = await render()
  await click(wrapper, 'Details')
  const modal = wrapper.get('[role="dialog"]')
  expect(modal.text()).toContain('Components decoded')
  expect(modal.text()).toContain('Records: 45')
  expect(modal.text()).toContain('1 / 3')
  expect(modal.findAll('pre')).toHaveLength(20)
  expect(modal.find('img').exists()).toBe(false)
  expect(modal.find('b').exists()).toBe(false)
  await click(wrapper, 'Next')
  expect(modal.text()).toContain('2 / 3')
  await click(wrapper, 'Next')
  expect(modal.findAll('pre')).toHaveLength(5)
  expect(modal.text()).toContain('3 / 3')
  await click(wrapper, 'Attributes')
  expect(modal.text()).toContain('This component was not decoded')
  await click(wrapper, 'Tracker events')
  expect(modal.text()).toContain('1 / 3')
})

test('busy operations disable controls and do not start duplicate work', async () => {
  let finish!: (value: unknown) => void
  mocks.pick.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const wrapper = await render()
  await click(wrapper, 'Scan directory')
  expect(
    wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined),
  ).toBe(true)
  await click(wrapper, 'Add replay')
  expect(mocks.pick).toHaveBeenCalledOnce()
  finish({ ok: true, data: { canceled: true, filePaths: [] } })
  await flushPromises()
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === 'Scan directory')!
      .attributes('disabled'),
  ).toBeUndefined()
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === 'Export ZIP')!
      .attributes('disabled'),
  ).toBeDefined()
})
