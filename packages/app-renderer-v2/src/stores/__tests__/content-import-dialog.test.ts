import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { Plugin } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import type { AnalysisResult, SourceInput } from '@scnexus/app-shared/types/content.type'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import ContentImportDialog from '../../components/content/ContentImportDialog.vue'
import zh from '../../locales/zh.json'
const mocks = vi.hoisted(() => ({
  analyze: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  cancel: vi.fn<(id: string) => Promise<unknown>>(),
  toast: vi.fn<(value: unknown) => void>(),
}))
vi.mock('../../ipcs/content', () => ({ ipcContentAnalyze: mocks.analyze }))
vi.mock('../../ipcs/campaign', () => ({ ipcCampaignCancel: mocks.cancel }))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
const modal = defineComponent({
  props: ['open'],
  template: '<div v-if="open"><slot name="body"/><slot name="footer"/></div>',
})
const button = defineComponent({
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot/></button>',
})
const wrappers: { unmount: () => void }[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.resetAllMocks()
})

test('choosing a conflicting descriptor reanalyzes then navigates and transfers the preview once', async () => {
  const accepted = vi.fn<(result: AnalysisResult) => void>()
  const campaign = defineComponent({
    render: () => h(ContentImportDialog, { contentType: 'campaign' }),
  })
  const customize = defineComponent({
    render: () => h(ContentImportDialog, { contentType: 'customize', onAnalyzed: accepted }),
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/campaign', component: campaign },
      { path: '/customize', component: customize },
    ],
  })
  await router.push('/campaign')
  mocks.analyze
    .mockResolvedValueOnce({
      ok: false,
      error: toErrorDto(new AppError(ERRORS.CONTENT_TYPE_CONFLICT)),
    })
    .mockResolvedValueOnce({
      ok: true,
      data: { analysisId: 'classified', contentType: 'customize' },
    })
  const wrapper = mount(RouterView, {
    global: {
      plugins: [
        createPinia(),
        router,
        createI18n({
          legacy: false,
          flatJson: true,
          locale: 'zh',
          messages: { zh },
        }) as unknown as Plugin,
      ],
      stubs: { Modal: modal, Button: button, Progress: true },
    },
  })
  wrappers.push(wrapper)
  const dialog = wrapper.findComponent(ContentImportDialog)
  const input = { kind: 'archive' as const, path: 'D:\\Conflict.zip' }
  await (dialog.vm as unknown as { analyze: (input: SourceInput) => Promise<void> }).analyze(input)
  expect(wrapper.text()).toContain('请选择使用哪个描述文件')
  expect(router.currentRoute.value.path).toBe('/campaign')
  await wrapper
    .findAll('button')
    .find((item) => item.text() === '使用 package.json')!
    .trigger('click')
  await flushPromises()
  expect(mocks.analyze.mock.calls).toEqual([
    [input, undefined],
    [input, 'package-json'],
  ])
  expect(router.currentRoute.value.path).toBe('/customize')
  expect(accepted).toHaveBeenCalledExactlyOnceWith({
    analysisId: 'classified',
    contentType: 'customize',
  })
  expect(mocks.cancel).not.toHaveBeenCalled()
})
