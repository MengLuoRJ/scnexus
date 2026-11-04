import { afterEach, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { ArchiveValidation } from '@scnexus/app-shared/types/content.type'
import UTabs from '@nuxt/ui/components/Tabs.vue'
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
      components: { UTabs },
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
  modes: { scnexus: null, ccm: null, auto: null },
  source: { kind: 'archive', path: 'D:\\test.zip' },
  sourceTree: {
    name: 'test.zip',
    path: '',
    kind: 'directory',
    bytes: 100,
    modifiedAt: null,
    children: [
      { name: 'package.json', path: 'package.json', kind: 'file', bytes: 100, modifiedAt: null },
    ],
  },
  fileCount: 1,
  bytes: 100,
  descriptors: [
    {
      path: 'package.json',
      standard: 'scnexus',
      fields: [{ name: 'name', value: 'Example' }],
      package: null,
      preview: null,
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
  for (const text of ['星际枢纽标准', 'CCM 标准', 'Example', 'name', '无法自动识别', '校验未通过'])
    expect(wrapper.text()).toContain(text)
  expect(wrapper.text()).not.toContain('进行安装')
  expect(wrapper.text()).not.toContain('AUTO_DESCRIPTOR_PRESENT')
  expect(wrapper.text()).not.toContain('按当前安装流程的自动识别规则判断')
  const html = wrapper.html()
  expect(html.indexOf('标准识别情况')).toBeLessThan(html.indexOf('源文件树'))
  expect(html.indexOf('源文件树')).toBeLessThan(html.indexOf('role="tablist"'))
  wrapper.findComponent(UTabs).vm.$emit('update:modelValue', 'ccm')
  await flushPromises()
  expect(wrapper.text()).toContain('未发现对应的描述文件')
  expect(wrapper.text()).not.toContain('Invalid descriptor')
  wrapper.findComponent(UTabs).vm.$emit('update:modelValue', 'auto')
  await flushPromises()
  expect(wrapper.text()).toContain('将按照星际枢纽标准兼容安装。')
  expect(wrapper.text()).not.toContain('AUTO_DESCRIPTOR_PRESENT')
})
test('shows full recognized preview, internal metadata, source and target trees', async () => {
  const preview = {
    package: {
      name: 'Example',
      author: 'Author',
      version: '1.0.0',
      type: 'customize' as const,
      description: 'Description',
    },
    rootRelativePath: 'Wrapper',
    descriptorPath: 'Wrapper/package.json',
    origin: 'package-json' as const,
    launcher: {
      source: 'detected' as const,
      target: 'Maps/Example.SC2Map',
      candidates: [{ name: 'Example', target: 'Maps/Example.SC2Map' }],
    },
    fileCount: 1,
    bytes: 100,
    files: [
      {
        source: 'Wrapper/Maps/Example.SC2Map',
        target: 'Maps/Example.SC2Map',
        type: 'map' as const,
        official: false,
        bytes: 100,
        modifiedAt: null,
      },
    ],
    targetTree: {
      name: 'Maps',
      path: 'Maps',
      bytes: 100,
      modifiedAt: null,
      kind: 'directory' as const,
      children: [
        {
          name: 'Example.SC2Map',
          path: 'Maps/Example.SC2Map',
          bytes: 100,
          modifiedAt: null,
          kind: 'file' as const,
        },
      ],
    },
  }
  mocks.dialog.mockResolvedValue({
    ok: true,
    data: { canceled: false, filePaths: ['D:\\test.zip'] },
  })
  mocks.analyze.mockResolvedValue({
    ok: true,
    data: {
      ...result,
      compressedBytes: 80,
      modes: { scnexus: preview, ccm: null, auto: null },
      descriptors: [
        { ...result.descriptors[0]!, valid: true, error: null, preview, package: preview.package },
      ],
    },
  })
  const wrapper = render()
  await wrapper.find('button').trigger('click')
  await flushPromises()
  for (const text of [
    '源文件树',
    'Author',
    '1.0.0',
    'Wrapper',
    'Example.SC2Map',
    '资源映射',
    '内部分析信息',
    '80 B',
  ])
    expect(wrapper.text()).toContain(text)
  expect(wrapper.find('pre').text()).toContain('rootRelativePath')

  mocks.analyze.mockResolvedValueOnce({
    ok: true,
    data: {
      ...result,
      modes: {
        scnexus: { ...preview, origin: 'ccm-converted' },
        ccm: { ...preview, origin: 'metadata-txt' },
        auto: null,
      },
      descriptors: [
        {
          ...result.descriptors[0]!,
          standard: 'ccm',
          valid: true,
          error: null,
          preview: { ...preview, origin: 'metadata-txt' },
          package: preview.package,
        },
      ],
    },
  })
  await wrapper.find('button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('此包通过 CCM 兼容转换生成 SCNexus 安装方案')
  expect(wrapper.text()).toContain('ccm-converted')
  expect(
    wrapper
      .findAll('[role="tab"]')
      .map((tab) => [tab.text(), tab.attributes('disabled') !== undefined]),
  ).toEqual([
    ['星际枢纽标准（兼容）', false],
    ['CCM 标准', false],
    ['自动识别', true],
  ])
  expect(wrapper.text()).toContain('不满足标准')
  wrapper.findComponent(UTabs).vm.$emit('update:modelValue', 'ccm')
  await flushPromises()
  expect(wrapper.text()).toContain('metadata-txt')
  expect(wrapper.text()).not.toContain('此包通过 CCM 兼容转换')
})

test('rejects multiple sources and accepts a folder on drop', async () => {
  const wrapper = render()
  const zone = wrapper.find('[class*="hover:border-primary"]')
  await zone.trigger('drop', {
    dataTransfer: { types: ['Files'], files: [new File([], 'a.zip'), new File([], 'b.zip')] },
  })
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ description: '每次只能分析一个压缩包或文件夹。' }),
  )
  mocks.path.mockReturnValue('D:\\folder')
  await zone.trigger('drop', {
    dataTransfer: { types: ['Files'], files: [new File([], 'folder')] },
  })
  expect(mocks.analyze).toHaveBeenCalledWith({ kind: 'directory', path: 'D:\\folder' })
})
test('folder selection opens the directory dialog and analyzes it', async () => {
  mocks.dialog.mockResolvedValue({ ok: true, data: { canceled: false, filePaths: ['D:\\folder'] } })
  mocks.analyze.mockResolvedValue({
    ok: true,
    data: { ...result, source: { kind: 'directory', path: 'D:\\folder' } },
  })
  const wrapper = render()
  await wrapper.findAll('button')[1]!.trigger('click')
  await flushPromises()
  expect(mocks.dialog).toHaveBeenCalledWith({ properties: ['openDirectory'], filters: undefined })
  expect(mocks.analyze).toHaveBeenCalledWith({ kind: 'directory', path: 'D:\\folder' })
  expect(wrapper.text()).toContain('Example')
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
  finish({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.ARCHIVE_METADATA_INVALID, { message: 'bad archive' })),
  })
  await flushPromises()
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'bad archive' }))
  expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
})
