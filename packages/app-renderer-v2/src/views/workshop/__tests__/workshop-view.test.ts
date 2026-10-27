import { afterEach, expect, test, vi } from 'vitest'
import { reactive, defineComponent } from 'vue'
import { createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../WorkshopView.vue'
import zh from '../../../locales/zh.json'
import workshopZh from '../../../locales/workshop.zh.json'
const state = reactive({ enabled: true, signedIn: false, active: false })
const mocks = vi.hoisted(() => ({
  list: vi.fn<() => Promise<unknown>>(),
  detail: vi.fn<() => Promise<unknown>>(),
  push: vi.fn<(value: unknown) => Promise<void>>(async () => {}),
  download: vi.fn<(source: unknown) => Promise<unknown>>(),
}))
const route = reactive({ params: {} as { scnid?: string }, fullPath: '/workshop' })
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: mocks.push }) }))
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({
    snapshot: { epoch: 1, sessionId: null },
    get signedIn() {
      return state.signedIn
    },
  }),
}))
vi.mock('../../../stores/creator', () => ({
  useCreatorStore: () => ({
    get active() {
      return state.active
    },
  }),
}))
vi.mock('../../../stores/content-center', () => ({
  useContentCenterStore: () => ({
    get enabled() {
      return state.enabled
    },
  }),
}))
vi.mock('../../../apis/workshop', () => ({
  apiWorkshopList: mocks.list,
  apiWorkshopDetail: mocks.detail,
}))
vi.mock('../../../ipcs/workshop', () => ({ ipcWorkshopDownload: mocks.download }))
vi.mock('../../../components/workshop/WorkshopRichText.vue', () => ({
  default: { template: '<div />' },
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: () => {} }) }))
const button = defineComponent({
  props: ['disabled', 'to'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})
const pass = defineComponent({ template: '<div><slot /><slot name="actions" /></div>' })
const wrappers: { unmount(): void }[] = []
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.clearAllMocks()
  state.enabled = true
  state.signedIn = false
  state.active = false
  route.params = {}
  route.fullPath = '/workshop'
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
          messages: { zh: { ...zh, ...workshopZh } },
        }) as unknown as Plugin,
      ],
      stubs: { Button: button, Card: pass, Alert: pass, Progress: true, Input: true },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
const project = {
  scnid: 2,
  approvedVersionId: '11111111-1111-4111-8111-111111111111',
  title: 'Public title',
  description: 'Public summary',
  detail: { type: 'doc', content: [] },
  website: '',
  social: {},
  sponsor: {},
}
test('anonymous users can browse projects but never get a creator entry', async () => {
  mocks.list.mockResolvedValue({ items: [project] })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('Public title')
  expect(wrapper.text()).not.toContain('创作者中心')
  expect(mocks.list).toHaveBeenCalledOnce()
})
test('anonymous download navigates to login with a safe return path without starting bytes', async () => {
  route.params = { scnid: '2' }
  route.fullPath = '/workshop/2'
  mocks.detail.mockResolvedValue(project)
  const wrapper = render()
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '登录后下载')!
    .trigger('click')
  expect(mocks.push).toHaveBeenCalledWith({ path: '/account', query: { redirect: '/workshop/2' } })
  expect(mocks.download).not.toHaveBeenCalled()
})
test('disabled module does not fetch projects', async () => {
  state.enabled = false
  render()
  await flushPromises()
  expect(mocks.list).not.toHaveBeenCalled()
})
