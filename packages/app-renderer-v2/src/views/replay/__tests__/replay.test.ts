import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import ReplayView from '../ReplayView.vue'
import en from '../../../locales/en'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  scan: vi.fn(),
  index: vi.fn(),
  archive: vi.fn(),
  delete: vi.fn(),
  pick: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('../../../ipcs', () => ({
  ipcReplayList: mocks.list,
  ipcReplayScanDirectory: mocks.scan,
  ipcReplayIndexFile: mocks.index,
  ipcReplayImportArchive: mocks.archive,
  ipcReplayDelete: mocks.delete,
  ipcDialogShowOpenDialog: mocks.pick,
}))
const record: ReplayRecord = {
  id: '1',
  path: 'D:\\replays\\sample.SC2Replay',
  fileName: 'sample.SC2Replay',
  extension: '.sc2replay',
  sizeBytes: 2048,
  mtimeMs: 1,
  status: 'partial',
  supportLevel: 'metadata-only',
  mapName: 'Test map',
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
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

test('loads indexed records, exposes partial metadata honestly and filters search', async () => {
  const wrapper = await render()
  expect(mocks.list).toHaveBeenCalledOnce()
  expect(wrapper.text()).toContain('Metadata only')
  expect(wrapper.text()).toContain('Unknown')
  expect(wrapper.text()).toContain('Missing details')
  expect(wrapper.text()).toContain('1:30')
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
  expect(article.text()).toContain('Base build: 97364')
  expect(article.text()).toContain('<b>SC2 player</b>')
  expect(article.find('b').exists()).toBe(false)
  const players = article.findAll('li')
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
  await click(wrapper, 'Delete')
  expect(wrapper.get('[role="dialog"]').text()).toContain(
    'permanently deletes the replay file from disk',
  )
  expect(mocks.delete).not.toHaveBeenCalled()
  await click(wrapper, 'Cancel')
  expect(mocks.delete).not.toHaveBeenCalled()
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
    wrapper.findAll('button').some((button) => button.attributes('disabled') !== undefined),
  ).toBe(false)
})
