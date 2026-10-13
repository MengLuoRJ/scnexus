import { afterEach, expect, test, vi } from 'vitest'
import { createPinia } from 'pinia'
import { nextTick, ref } from 'vue'
import type { Plugin } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import CampaignView from '../views/campaign/CampaignView.vue'
import CustomizeView from '../views/customize/CustomizeView.vue'
import zh from '../locales/zh.json'
const mocks = vi.hoisted(() => ({
  toast: vi.fn<(value: unknown) => void>(),
  campaign: vi.fn<() => unknown>(),
  customize: vi.fn<() => unknown>(),
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('../views/campaign/useCampaign', () => ({ useCampaign: mocks.campaign }))
vi.mock('../views/customize/useCustomize', () => ({ useCustomize: mocks.customize }))
const wrappers: { unmount: () => void }[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  document.querySelector('#page-actions')?.remove()
  vi.clearAllMocks()
})

test.each(['campaign', 'customize'] as const)(
  '%s page displays error guidance and committed-operation warning as separate toasts',
  async (domain) => {
    const state = {
      records: ref([]),
      active: ref({}),
      busy: ref(false),
      error: ref<AppErrorDto | null>(null),
      warnings: ref<AppErrorDto[]>([]),
      diagnostics: ref([]),
    }
    mocks[domain].mockReturnValue(state)
    const target = document.createElement('div')
    target.id = 'page-actions'
    document.body.append(target)
    const wrapper = mount(domain === 'campaign' ? CampaignView : CustomizeView, {
      global: {
        plugins: [
          createPinia(),
          createI18n({
            legacy: false,
            flatJson: true,
            locale: 'zh',
            messages: { zh },
          }) as unknown as Plugin,
        ],
        stubs: {
          CampaignOverview: true,
          CampaignDetails: true,
          CampaignSourcePicker: true,
          CampaignLibraryModal: true,
          CampaignInstallModal: true,
          ContentImportDialog: true,
          CampaignOperationModal: true,
          CustomizeUninstallModal: true,
          FileTree: true,
          Alert: true,
          Button: true,
          Tabs: true,
        },
      },
    })
    wrappers.push(wrapper)
    const error = toErrorDto(
      new AppError(ERRORS.FILESYSTEM_BUSY, { message: 'EBUSY: Maps/Level.SC2Map' }),
    )
    state.error.value = error
    await nextTick()
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        title: '操作失败 · M060',
        description: expect.stringContaining('请关闭相关程序后重试'),
      }),
    )
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining(error.errorId) }),
    )
    const warning = toErrorDto(
      new AppError(ERRORS.CONTENT_CLEANUP_WARNING, { message: 'EPERM: temporary files' }),
    )
    state.error.value = null
    state.warnings.value = [warning]
    await nextTick()
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: warning.errorId,
        color: 'warning',
        title: '操作警告 · M062',
        description: expect.stringContaining('请勿重复执行'),
      }),
    )
    expect(state.error.value).toBeNull()
  },
)
