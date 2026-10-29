import { afterEach, expect, test, vi } from 'vitest'
import { reactive, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import type { WorkshopTask } from '@scnexus/app-shared/types/workshop.type'
import AppLayout from '../AppLayout.vue'
import zh from '../../locales/zh.json'
import workshopZh from '../../locales/workshop.zh.json'
const mocks = vi.hoisted(() => ({
  toast: vi.fn<(value: unknown) => void>(),
  connect: vi.fn<() => () => void>(),
  stop: vi.fn<() => void>(),
}))
const transfers = reactive({ tasks: [] as WorkshopTask[], connect: mocks.connect })
vi.mock('../../stores/workshop', () => ({ useWorkshopStore: () => transfers }))
vi.mock('../../stores/auth', () => ({
  useAuthStore: () => ({ signedIn: false, initialize: async () => {}, dispose: () => {} }),
}))
vi.mock('../../stores/content-center', () => ({
  useContentCenterStore: () => ({ enabled: false, initialize: async () => {}, accept: () => {} }),
}))
vi.mock('../../stores/creator', () => ({
  useCreatorStore: () => ({ active: false, loading: false }),
}))
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
          messages: { zh: { ...zh, ...workshopZh } },
        }),
      ],
      stubs: { AppSidebar: true },
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
