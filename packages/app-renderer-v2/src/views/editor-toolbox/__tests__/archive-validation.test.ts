import { afterEach, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import type { ArchiveValidation } from '@scnexus/app-shared/types/content.type'
import ArchiveValidationView from '../ArchiveValidationView.vue'
import zh from '../../../locales/zh'
const mocks = vi.hoisted(() => ({
  analyze: vi.fn<typeof import('../../../ipcs').ipcContentValidateArchive>(),
  dialog: vi.fn<typeof import('../../../ipcs').ipcDialogShowOpenDialog>(),
  path: vi.fn<(file: File) => string>(),
  toast: vi.fn<(options: unknown) => void>(),
}))
vi.mock('../../../ipcs', () => ({
  ipcContentValidateArchive: mocks.analyze,
  ipcDialogShowOpenDialog: mocks.dialog,
  ipcGetPathForFile: mocks.path,
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
const wrappers: { unmount(): void }[] = []
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.resetAllMocks()
})
function render() {
  const wrapper = mount(ArchiveValidationView, {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh', messages: { zh } }) as unknown as Plugin],
      stubs: {
        UButton: { template: '<button :disabled="$attrs.disabled"><slot /></button>' },
        UBadge: { template: '<span><slot /></span>' },
        UAlert: {
          props: ['title', 'description'],
          template: '<p>{{ title }} {{ description }}</p>',
        },
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
const result: ArchiveValidation = {
  source: { kind: 'archive', path: 'D:\\test.zip' },
  fileCount: 1,
  bytes: 100,
  descriptors: [
    {
      path: 'package.json',
      standard: 'scnexus',
      fields: [{ name: 'name', value: 'Example' }],
      package: null,
      valid: false,
      fileCount: 0,
      error: { code: 'M034', message: 'Invalid descriptor' },
    },
  ],
  automatic: {
    contentType: 'customize',
    preview: null,
    diagnostic: { mode: 'auto', level: 'error', code: 'AUTO_DESCRIPTOR_PRESENT' },
  },
  diagnostic: null,
}
test('selects only archives and displays fields, missing CCM and automatic status without installing', async () => {
  mocks.dialog.mockResolvedValue({
    ok: true,
    data: { canceled: false, filePaths: ['D:\\test.zip'] },
  })
  mocks.analyze.mockResolvedValue({ ok: true, data: result })
  const wrapper = render()
  await wrapper.find('button').trigger('click')
  await flushPromises()
  expect(mocks.dialog).toHaveBeenCalledWith({
    properties: ['openFile'],
    filters: [{ name: 'Archives', extensions: ['zip', '7z', 'rar'] }],
  })
  expect(mocks.analyze).toHaveBeenCalledWith({ kind: 'archive', path: 'D:\\test.zip' })
  for (const text of [
    '星际枢纽标准',
    'CCM 标准',
    'Example',
    'name',
    '未发现对应的描述文件',
    '无法自动识别',
    '校验未通过',
  ])
    expect(wrapper.text()).toContain(text)
  expect(wrapper.text()).not.toContain('进行安装')
})
test('rejects multiple files and folders on drop', async () => {
  const wrapper = render()
  const zone = wrapper.find('[class*="hover:border-primary"]')
  await zone.trigger('drop', {
    dataTransfer: { types: ['Files'], files: [new File([], 'a.zip'), new File([], 'b.zip')] },
  })
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: '请一次放入一个压缩包' }),
  )
  mocks.path.mockReturnValue('D:\\folder')
  await zone.trigger('drop', {
    dataTransfer: { types: ['Files'], files: [new File([], 'folder')] },
  })
  expect(mocks.analyze).not.toHaveBeenCalled()
})
test('prevents concurrent analysis and shows failures as toast', async () => {
  let finish!: (value: Awaited<ReturnType<typeof mocks.analyze>>) => void
  mocks.dialog.mockResolvedValue({
    ok: true,
    data: { canceled: false, filePaths: ['D:\\test.zip'] },
  })
  mocks.analyze.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const wrapper = render()
  await wrapper.find('button').trigger('click')
  await flushPromises()
  expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  await wrapper.find('button').trigger('click')
  expect(mocks.analyze).toHaveBeenCalledOnce()
  finish({ ok: false, error: { code: 'M034', errorId: 'test', message: 'bad archive' } })
  await flushPromises()
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'bad archive' }))
  expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
})
