import { afterEach, expect, test, vi } from 'vitest'
import { reactive, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import type { Plugin } from 'vue'
import View from '../DownloadsView.vue'
import zh from '../../../locales/zh'
const mocks = vi.hoisted(() => ({
  source: vi.fn<() => Promise<unknown>>(),
  analyze: vi.fn<() => Promise<unknown>>(),
  install: vi.fn<() => Promise<unknown>>(),
  download: vi.fn<() => Promise<unknown>>(),
  openDownload: vi.fn<() => void>(),
  openLocation: vi.fn<() => Promise<unknown>>(),
  inspect: vi.fn<() => Promise<unknown>>(),
  remove: vi.fn<() => Promise<unknown>>(),
  workshopDownload: vi.fn<(scnid: number) => Promise<unknown>>(),
  push: vi.fn<(value: unknown) => Promise<void>>(),
  accept: vi.fn<(value: unknown) => void>(),
  toast: vi.fn<(value: unknown) => void>(),
}))
const access = reactive({ signedIn: true, enabled: true })
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('../../../stores/auth', () => ({ useAuthStore: () => access }))
vi.mock('../../../stores/content-center', () => ({ useContentCenterStore: () => access }))
const state = reactive({
  openDownload: mocks.openDownload,
  removeDownload: mocks.remove,
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
  ipcWorkshopOpenDownloadLocation: mocks.openLocation,
  ipcWorkshopDownload: mocks.download,
  ipcWorkshopInspectDownload: mocks.inspect,
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
  vi.unstubAllGlobals()
  access.signedIn = true
  access.enabled = true
})
function render() {
  const wrapper = mount(View, {
    global: {
      plugins: [
        createPinia(),
        createI18n({
          legacy: false,
          locale: 'zh',
          flatJson: true,
          messages: { zh },
        }) as unknown as Plugin,
      ],
      stubs: {
        Button: button,
        Modal: modal,
        Alert: true,
        Progress: true,
        Badge: true,
        Select: defineComponent({
          props: ['modelValue', 'items'],
          emits: ['update:modelValue'],
          template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>`,
        }),
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
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '历史记录')!
    .trigger('click')
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

test('manual entry opens the shared wizard without creating a task', async () => {
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '新建任务')!
    .trigger('click')
  expect(mocks.openDownload).toHaveBeenCalledOnce()
  expect(mocks.download).not.toHaveBeenCalled()
})
test.each([true, false])(
  'deletion inspects cache and offers file deletion only when present (%s)',
  async (fileExists) => {
    mocks.inspect.mockResolvedValue({ data: { fileExists } })
    mocks.remove.mockResolvedValue(undefined)
    const wrapper = render()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '历史记录')!
      .trigger('click')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '删除任务')!
      .trigger('click')
    await flushPromises()
    expect(mocks.inspect).toHaveBeenCalledWith('test-task')
    expect(wrapper.findAll('button').some((button) => button.text() === '记录和文件')).toBe(
      fileExists,
    )
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '仅删除记录')!
      .trigger('click')
    await flushPromises()
    expect(mocks.remove).toHaveBeenCalledWith('test-task', false)
  },
)

test('open download location invokes the dedicated bridge without starting a download or installation', async () => {
  vi.stubGlobal('scnexus', {})
  mocks.openLocation.mockResolvedValue({ ok: true, data: undefined })
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '打开下载位置')!
    .trigger('click')
  await flushPromises()
  expect(mocks.openLocation).toHaveBeenCalledOnce()
  expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.install).not.toHaveBeenCalled()
})

test('open download location is disabled without desktop bridge', () => {
  const wrapper = render()
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === '打开下载位置')!
      .attributes('disabled'),
  ).toBeDefined()
})

test('open download location reports system failures with a toast', async () => {
  vi.stubGlobal('scnexus', {})
  mocks.openLocation.mockRejectedValue(new Error('DOWNLOAD_LOCATION_OPEN_FAILED'))
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '打开下载位置')!
    .trigger('click')
  await flushPromises()
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ color: 'error', title: '无法打开下载位置，请检查目录权限后重试' }),
  )
})
