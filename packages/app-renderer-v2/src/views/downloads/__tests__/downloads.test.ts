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
})
vi.mock('../../../stores/workshop', () => ({
  useWorkshopStore: () => state,
  unwrapWorkshop: (value: { data: unknown }) => value.data,
}))
vi.mock('../../../ipcs/workshop', () => ({
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
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: () => {} }) }))
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
