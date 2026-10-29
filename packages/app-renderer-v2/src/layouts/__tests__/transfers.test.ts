import { afterEach, expect, test, vi } from 'vitest'
import { reactive, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import type { WorkshopTask } from '@scnexus/app-shared/types/workshop.type'
import type { DeepLinkWorkshop } from '@scnexus/app-shared/types/desktop.type'
import AppLayout from '../AppLayout.vue'
import zh from '../../locales/zh'
const mocks = vi.hoisted(() => ({
  deepLink: vi.fn<(listener: (intent: DeepLinkWorkshop) => void) => () => void>(() => () => {}),
  toast: vi.fn<(value: unknown) => void>(),
  connect: vi.fn<() => () => void>(),
  stop: vi.fn<() => void>(),
}))
const transfers = reactive({ tasks: [] as WorkshopTask[], connect: mocks.connect })
vi.mock('../../stores/workshop', () => ({ useWorkshopStore: () => transfers }))
vi.mock('../../stores/auth', () => ({
  useAuthStore: () => ({ signedIn: false, initialize: async () => {}, dispose: () => {} }),
}))
const center = reactive({ enabled: false, initialize: async () => {}, accept: () => {} })
vi.mock('../../stores/content-center', () => ({
  useContentCenterStore: () => center,
}))
vi.mock('../../stores/creator', () => ({
  useCreatorStore: () => ({ active: false, loading: false }),
}))
vi.mock('../../ipcs/deep-link', () => ({ ipcDeepLinkOnWorkshop: mocks.deepLink }))
vi.mock('../../ipcs', () => ({
  ipcSettingOnChanged: () => () => {},
  ipcSettingGetSnapshot: async () => ({ ok: false }),
  ipcWindowReady: async () => {},
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  transfers.tasks = []
})
test('anonymous GitHub transfers stay subscribed with workshop disabled and completion notifies once', async () => {
  vi.stubGlobal('scnexus', {})
  mocks.connect.mockReturnValue(mocks.stop)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  const wrapper = mount(AppLayout, {
    global: {
      plugins: [
        router,
        createI18n({
          legacy: false,
          flatJson: true,
          locale: 'zh',
          messages: { zh },
        }),
      ],
      stubs: { AppSidebar: true, DownloadWizard: true },
    },
  })
  try {
    await flushPromises()
    expect(mocks.connect).toHaveBeenCalledOnce()
    const task: WorkshopTask = {
      taskId: 'github',
      kind: 'download',
      name: 'Repository',
      status: 'running',
      transferred: 0,
      size: 5,
    }
    transfers.tasks = [{ ...task, taskId: 'old', status: 'completed' }]
    await nextTick()
    expect(mocks.toast).not.toHaveBeenCalled()
    transfers.tasks = [task]
    await nextTick()
    expect(mocks.toast).not.toHaveBeenCalled()
    transfers.tasks = [{ ...task, status: 'completed', transferred: 5 }]
    await nextTick()
    transfers.tasks = [...transfers.tasks]
    await nextTick()
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      color: 'success',
      title: '下载完成，请到下载管理点击安装',
    })
  } finally {
    wrapper.unmount()
  }
  expect(mocks.stop).toHaveBeenCalledOnce()
})

test('layout routes typed workshop links and warns instead of enabling a disabled module', async () => {
  vi.stubGlobal('scnexus', {})
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/workshop/:scnid', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(AppLayout, {
    global: {
      plugins: [
        router,
        createI18n({
          legacy: false,
          flatJson: true,
          locale: 'zh',
          messages: { zh },
        }),
      ],
      stubs: { AppSidebar: true, DownloadWizard: true },
    },
  })
  try {
    const handler = mocks.deepLink.mock.calls[0]![0]
    handler({ scnid: 42, download: false })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'SCNexus Workshop 已禁用' }),
    )
    center.enabled = true
    handler({ scnid: 42, download: true })
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workshop/42?download=true')
    handler({ scnid: 43, download: false })
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workshop/43')
  } finally {
    wrapper.unmount()
    center.enabled = false
  }
})
