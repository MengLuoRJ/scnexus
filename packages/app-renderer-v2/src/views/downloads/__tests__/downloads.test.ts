import { afterEach, expect, test, vi } from 'vitest'
import { reactive, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../DownloadsView.vue'
import zh from '../../../locales/zh.json'
import workshopZh from '../../../locales/workshop.zh.json'
const mocks = vi.hoisted(() => ({
  source: vi.fn<() => Promise<unknown>>(),
  analyze: vi.fn<() => Promise<unknown>>(),
  install: vi.fn<() => Promise<unknown>>(),
  download: vi.fn<() => Promise<unknown>>(),
  accept: vi.fn<(value: unknown) => void>(),
  toast: vi.fn<(value: unknown) => void>(),
}))
const state = reactive({
  downloads: [
    {
      taskId: 'test-task',
      name: 'Completed download',
      status: 'completed',
      transferred: 20,
      size: 20,
    },
  ],
  loading: false,
  error: null,
  load: async () => {},
  connect: () => () => {},
  accept: mocks.accept,
})
vi.mock('../../../stores/workshop', () => ({
  useWorkshopStore: () => state,
  unwrapWorkshop: (value: { data: unknown }) => value.data,
}))
vi.mock('../../../ipcs/workshop', () => ({
  ipcWorkshopDownload: mocks.download,
  ipcWorkshopInstallSource: mocks.source,
  ipcWorkshopPause: async () => {},
  ipcWorkshopResume: async () => {},
  ipcWorkshopCancel: async () => {},
}))
vi.mock('../../../ipcs/content', () => ({ ipcContentAnalyze: mocks.analyze }))
vi.mock('../../../ipcs/dependency', () => ({
  ipcDependencyList: async () => ({ data: { records: [] } }),
  ipcDependencyInstall: mocks.install,
  ipcDependencyPrepareUninstall: async () => {},
  ipcDependencyUninstall: async () => {},
}))
vi.mock('../../../ipcs/campaign', () => ({
  ipcCampaignCancel: async () => {},
  ipcCampaignInstall: mocks.install,
}))
vi.mock('../../../ipcs/customize', () => ({ ipcCustomizeInstall: mocks.install }))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
const button = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})
const modal = defineComponent({
  props: ['open'],
  template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>',
})
const wrappers: { unmount(): void }[] = []
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.clearAllMocks()
})
function render() {
  const wrapper = mount(View, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'zh',
          flatJson: true,
          messages: { zh: { ...zh, ...workshopZh } },
        }) as unknown as Plugin,
      ],
      stubs: {
        Button: button,
        Modal: modal,
        Alert: true,
        Progress: true,
        Badge: true,
        Select: true,
        Form: defineComponent({
          emits: ['submit'],
          template: '<form @submit.prevent="$emit(\'submit\')"><slot /></form>',
        }),
        FormField: defineComponent({ template: '<div><slot /></div>' }),
        Input: defineComponent({
          props: ['modelValue', 'disabled'],
          emits: ['update:modelValue'],
          template: `<input :value="modelValue" :disabled="disabled" @input="$emit('update:modelValue', $event.target.value)" />`,
        }),
        ConflictChoices: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
test('completed downloads never install automatically; explicit install verifies cache then asks for confirmation', async () => {
  mocks.source.mockResolvedValue({ data: { kind: 'archive', path: 'controlled-cache' } })
  mocks.analyze.mockResolvedValue({
    data: {
      analysisId: 'analysis',
      modes: { scnexus: { package: { name: 'Dependency', type: 'dependency' } } },
      conflicts: [],
    },
  })
  mocks.install.mockResolvedValue({ data: { package: { name: 'Dependency' } } })
  const wrapper = render()
  await flushPromises()
  expect(mocks.source).not.toHaveBeenCalled()
  expect(mocks.install).not.toHaveBeenCalled()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '安装')!
    .trigger('click')
  await flushPromises()
  expect(mocks.source).toHaveBeenCalledOnce()
  expect(mocks.analyze).toHaveBeenCalledOnce()
  expect(mocks.install).not.toHaveBeenCalled()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '确认执行')!
    .trigger('click')
  await flushPromises()
  expect(mocks.install).toHaveBeenCalledWith({
    analysisId: 'analysis',
    mode: 'scnexus',
    decisions: [],
  })
})

test('new public GitHub task defaults to main and never starts installation', async () => {
  const task = { taskId: 'github-task', kind: 'download', name: 'Example', status: 'running' }
  mocks.download.mockResolvedValue({ ok: true, data: task })
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '新建任务')!
    .trigger('click')
  const inputs = wrapper.findAll('input')
  expect((inputs[1]!.element as HTMLInputElement).value).toBe('main')
  await inputs[0]!.setValue('https://github.com/MengLuoRJ/scnexus-package-test')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.download).toHaveBeenCalledWith({
    kind: 'github',
    repository: 'https://github.com/MengLuoRJ/scnexus-package-test',
    revision: 'main',
  })
  expect(mocks.accept).toHaveBeenCalledWith(task)
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  expect(mocks.source).not.toHaveBeenCalled()
  expect(mocks.install).not.toHaveBeenCalled()
})

test('custom branch is sent unchanged and invalid repository URLs are rejected locally', async () => {
  mocks.download.mockResolvedValue({ ok: true, data: { taskId: 'task', name: 'Example' } })
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '新建任务')!
    .trigger('click')
  const inputs = wrapper.findAll('input')
  await inputs[0]!.setValue('https://github.com.evil.test/owner/repo')
  await wrapper.get('form').trigger('submit')
  expect(mocks.download).not.toHaveBeenCalled()
  await inputs[0]!.setValue('https://github.com/owner/repo.git')
  await inputs[1]!.setValue('feature/new-package')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.download).toHaveBeenCalledWith({
    kind: 'github',
    repository: 'https://github.com/owner/repo.git',
    revision: 'feature/new-package',
  })
})

test('manifest check failure keeps form values for correction and shows a failure toast', async () => {
  mocks.download.mockResolvedValue({ ok: false, error: { message: 'GITHUB_MANIFEST_INVALID' } })
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '新建任务')!
    .trigger('click')
  await wrapper.findAll('input')[0]!.setValue('https://github.com/owner/repo')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.find('form').exists()).toBe(true)
  expect((wrapper.findAll('input')[0]!.element as HTMLInputElement).value).toBe(
    'https://github.com/owner/repo',
  )
  expect(mocks.accept).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
})
