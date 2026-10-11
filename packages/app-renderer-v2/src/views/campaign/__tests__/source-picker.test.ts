import { afterEach, expect, test, vi } from 'vitest'
import type { Plugin } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { IpcResult } from '@scnexus/app-shared/errors/app.error'
import CampaignSourcePicker from '../components/CampaignSourcePicker.vue'
import zh from '../../../locales/zh.json'

const mocks = vi.hoisted(() => ({
  dialog:
    vi.fn<(options: unknown) => Promise<IpcResult<{ canceled: boolean; filePaths: string[] }>>>(),
  path: vi.fn<(file: File) => string>(),
}))
vi.mock('../../../ipcs', () => ({
  apiDialogShowOpenDialog: mocks.dialog,
  getPathForFile: mocks.path,
}))
const wrappers: { unmount: () => void }[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.resetAllMocks()
})
function render(disabled = false) {
  const wrapper = mount(CampaignSourcePicker, {
    props: { disabled },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh', messages: { zh } }) as unknown as Plugin],
      stubs: { Icon: true },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
function link(wrapper: ReturnType<typeof render>, name: string) {
  return wrapper.findAll('button').find((item) => item.text() === name)!
}

test.each([
  ['压缩包', 'archive', 'openFile', 'D:\\Campaign.zip'],
  ['文件夹', 'directory', 'openDirectory', 'D:\\Campaign'],
] as const)(
  '%s link directly opens its matching picker without the source modal',
  async (name, kind, property, path) => {
    mocks.dialog.mockResolvedValue({ ok: true, data: { canceled: false, filePaths: [path] } })
    const wrapper = render()
    expect(wrapper.text()).toContain('拖入或点击选择 压缩包 / 文件夹 进行安装')
    expect(link(wrapper, name).classes()).toContain('underline')
    expect(wrapper.find('button button').exists()).toBe(false)
    await link(wrapper, name).trigger('click')
    await flushPromises()
    expect(mocks.dialog).toHaveBeenCalledWith({
      properties: [property],
      filters:
        kind === 'archive' ? [{ name: 'Archives', extensions: ['zip', '7z', 'rar'] }] : undefined,
    })
    expect(wrapper.emitted('select')).toEqual([[{ kind, path }]])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  },
)

test('only the source names are clickable while the rest of the area retains hover styling', async () => {
  const wrapper = render()
  expect(wrapper.findAll('button')).toHaveLength(2)
  expect(wrapper.classes()).toContain('hover:shadow-md')
  await wrapper.trigger('click')
  await wrapper.find('div').trigger('click')
  await wrapper.find('span').trigger('click')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(mocks.dialog).not.toHaveBeenCalled()
})

test('direct source links cannot start another picker while one is pending', async () => {
  let finish!: (result: IpcResult<{ canceled: boolean; filePaths: string[] }>) => void
  mocks.dialog.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const wrapper = render()
  await link(wrapper, '压缩包').trigger('click')
  expect(wrapper.findAll('button').every((item) => item.attributes('disabled') !== undefined)).toBe(
    true,
  )
  await link(wrapper, '文件夹').trigger('click')
  expect(mocks.dialog).toHaveBeenCalledOnce()
  finish({ ok: true, data: { canceled: true, filePaths: [] } })
  await flushPromises()
  expect(wrapper.emitted('select')).toBeUndefined()
  expect(link(wrapper, '文件夹').attributes('disabled')).toBeUndefined()
})

test('disabled links and installation area do not open a picker', async () => {
  const wrapper = render(true)
  await link(wrapper, '压缩包').trigger('click')
  await link(wrapper, '文件夹').trigger('click')
  await wrapper.trigger('click')
  expect(mocks.dialog).not.toHaveBeenCalled()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})

test('file drops still emit the recognized source', async () => {
  mocks.path.mockReturnValue('D:\\Campaign.zip')
  const wrapper = render()
  await wrapper.find('div').trigger('drop', {
    dataTransfer: { types: ['Files'], files: [new File(['demo'], 'Campaign.zip')] },
  })
  expect(wrapper.emitted('select')).toEqual([[{ kind: 'archive', path: 'D:\\Campaign.zip' }]])
  expect(mocks.dialog).not.toHaveBeenCalled()
})
