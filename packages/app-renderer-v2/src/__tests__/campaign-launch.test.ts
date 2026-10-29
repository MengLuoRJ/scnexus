import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import CampaignView from '../views/campaign/CampaignView.vue'
import zh from '../locales/zh'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
const mocks = vi.hoisted(() => ({
  launch: vi.fn<() => Promise<unknown>>(),
  toast: vi.fn<(value: unknown) => void>(),
}))
vi.mock('../ipcs', () => ({
  ipcCampaignLaunch: mocks.launch,
  ipcShellOpenExternalWebsite: async () => {},
  ipcShellShowItemInFolder: async () => {},
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('../views/campaign/useCampaign', () => ({
  useCampaign: () => ({
    diagnostics: ref([]),
    records: ref([]),
    active: ref({}),
    busy: ref(false),
    error: ref(null),
    warnings: ref([]),
    refresh: async () => {},
  }),
}))
const button = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})
afterEach(() => {
  vi.clearAllMocks()
  Reflect.deleteProperty(window, 'scnexus')
  document.querySelector('#page-actions')?.remove()
})
test.each(['success', 'failure', 'throw'] as const)(
  'campaign launch %s only confirms successful launcher requests',
  async (result) => {
    Object.defineProperty(window, 'scnexus', { configurable: true, value: {} })
    const target = document.createElement('div')
    target.id = 'page-actions'
    document.body.append(target)
    if (result === 'success') mocks.launch.mockResolvedValue({ ok: true, data: undefined })
    else if (result === 'failure')
      mocks.launch.mockResolvedValue({
        ok: false,
        error: toErrorDto(new AppError(ERRORS.GAME_LAUNCH_FAILED)),
      })
    else mocks.launch.mockRejectedValue(new Error('failed'))
    const wrapper = mount(CampaignView, {
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
          Alert: true,
          Tabs: true,
          CampaignOverview: true,
          CampaignDetails: true,
          CampaignManagement: true,
          CampaignSourcePicker: true,
          CampaignLibraryModal: true,
          CampaignInstallModal: true,
          CampaignOperationModal: true,
          ContentImportDialog: true,
        },
      },
    })
    try {
      await flushPromises()
      await wrapper
        .findAll('button')
        .find((item) => item.text() === '开始游戏')!
        .trigger('click')
      await flushPromises()
      expect(mocks.launch).toHaveBeenCalledOnce()
      const success = mocks.toast.mock.calls.filter(
        ([value]) => (value as { color: string }).color === 'success',
      )
      expect(success).toHaveLength(result === 'success' ? 1 : 0)
      expect(success.map(([value]) => (value as { title: string }).title)).toEqual(
        result === 'success' ? ['已为你启动战网，请在战网再次点击“开始游戏”。'] : [],
      )
    } finally {
      wrapper.unmount()
    }
  },
)
