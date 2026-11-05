import { afterEach, expect, test, vi } from 'vitest'
import { reactive, defineComponent } from 'vue'
import { createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../WorkshopView.vue'
import { useWorkshopStore } from '../../../stores/workshop'
import zh from '../../../locales/zh'
const state = reactive({ enabled: true, signedIn: false, active: false })
const mocks = vi.hoisted(() => ({
  list: vi.fn<() => Promise<unknown>>(),
  detail: vi.fn<() => Promise<unknown>>(),
  replace: vi.fn<(value: unknown) => Promise<void>>(async () => {}),
  push: vi.fn<(value: unknown) => Promise<void>>(async () => {}),
  download: vi.fn<(source: unknown) => Promise<unknown>>(),
  external: vi.fn<(url: string) => Promise<unknown>>(),
}))
const route = reactive({
  params: {} as { scnid?: string },
  query: {} as Record<string, string>,
  path: '/workshop',
  fullPath: '/workshop',
})
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({
    initialize: async () => {},
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
    initialize: async () => {},
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
vi.mock('../../../ipcs/shell', () => ({
  ipcShellOpenExternalWebsite: vi.fn<(url: string) => Promise<unknown>>(),
  ipcShellOpenExternalDownload: mocks.external,
}))
vi.mock('../../../components/workshop/WorkshopRichText.vue', () => ({
  default: { template: '<div />' },
}))
vi.mock('../../../components/workshop/WorkshopCommunity.vue', () => ({
  default: { template: '<div data-community />' },
}))
vi.mock('../../../components/workshop/WorkshopFavorites.vue', () => ({
  default: { template: '<div data-favorites />' },
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
  route.query = {}
  route.path = '/workshop'
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
          messages: { zh },
        }) as unknown as Plugin,
      ],
      stubs: {
        Modal: defineComponent({
          props: ['open', 'description'],
          template:
            '<div v-if="open" data-confirm>{{ description }}<slot name="body" /><slot name="footer" /></div>',
        }),
        Button: button,
        Card: pass,
        Alert: pass,
        Progress: true,
        Input: true,
      },
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
test('favorites tab uses the private list instead of public project browsing', async () => {
  route.query = { tab: 'favorites' }
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('[data-favorites]').exists()).toBe(true)
  expect(mocks.list).not.toHaveBeenCalled()
  expect(mocks.detail).not.toHaveBeenCalled()
})
test('project detail includes the community section', async () => {
  route.params = { scnid: '2' }
  mocks.detail.mockResolvedValue({
    ...project,
    aiAssistedDevelopment: true,
    aiGeneratedArt: false,
    aiGeneratedVoice: null,
  })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('[data-community]').exists()).toBe(true)
  expect(wrapper.findAll('dd').map((d) => d.text())).toEqual(['使用', '未使用', '未声明'])
})
test('anonymous download navigates to login with a safe return path without starting bytes', async () => {
  route.params = { scnid: '2' }
  route.path = '/workshop/2'
  route.fullPath = '/workshop/2'
  mocks.detail.mockResolvedValue(project)
  const wrapper = render()
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '登录后下载')!
    .trigger('click')
  expect(mocks.push).toHaveBeenCalledWith({
    path: '/account',
    query: { redirect: '/workshop/2?download=true' },
  })
  expect(mocks.download).not.toHaveBeenCalled()
})
test('disabled module does not fetch projects', async () => {
  state.enabled = false
  render()
  await flushPromises()
  expect(mocks.list).not.toHaveBeenCalled()
})

test('download deep link asks for confirmation before creating a task', async () => {
  state.signedIn = true
  route.params = { scnid: '2' }
  route.path = '/workshop/2'
  route.fullPath = '/workshop/2?download=true'
  route.query = { download: 'true' }
  mocks.detail.mockResolvedValue(project)
  mocks.download.mockResolvedValue({ ok: true, data: { taskId: 'task' } })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('[data-confirm]').exists()).toBe(false)
  expect(useWorkshopStore().wizardOpen).toBe(true)
  expect(useWorkshopStore().draft.scnid).toBe('2')
  expect(useWorkshopStore().preview).toBeNull()
  expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.replace).toHaveBeenCalledWith({ path: '/workshop/2', query: {} })
})

test('anonymous deep-link intent survives login redirect without creating a task', async () => {
  route.params = { scnid: '2' }
  route.path = '/workshop/2'
  route.fullPath = '/workshop/2?download=true'
  route.query = { download: 'true' }
  mocks.detail.mockResolvedValue(project)
  const wrapper = render()
  await flushPromises()
  expect(mocks.replace).toHaveBeenCalledWith({
    path: '/account',
    query: { redirect: '/workshop/2?download=true' },
  })
  expect(wrapper.find('[data-confirm]').exists()).toBe(false)
  expect(mocks.download).not.toHaveBeenCalled()
})

test('cancelling deep-link confirmation clears intent and never downloads', async () => {
  state.signedIn = true
  route.params = { scnid: '2' }
  route.path = '/workshop/2'
  route.fullPath = '/workshop/2?download=true'
  route.query = { download: 'true' }
  mocks.detail.mockResolvedValue(project)
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('[data-confirm]').exists()).toBe(false)
  useWorkshopStore().closeDownload()
  await flushPromises()
  expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.replace).toHaveBeenCalledWith({ path: '/workshop/2', query: {} })
})

const downloadLinks = [
  { url: 'https://download.example.test/file.zip', description: '<b>Manual download</b>' },
]
async function click(wrapper: ReturnType<typeof render>, label: string) {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === label)!
    .trigger('click')
  await flushPromises()
}
test('external-only works are visible anonymously and require confirmation before opening a browser', async () => {
  route.params = { scnid: '2' }
  mocks.detail.mockResolvedValue({ ...project, approvedVersionId: null, downloadLinks })
  mocks.external.mockResolvedValue({ ok: true, data: null })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('Public title')
  expect(wrapper.text()).toContain('<b>Manual download</b>')
  expect(wrapper.find('b').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('登录后下载')
  await click(wrapper, '前往外站下载')
  expect(mocks.external).not.toHaveBeenCalled()
  expect(wrapper.find('[data-confirm]').text()).toContain('download.example.test')
  await click(wrapper, '取消')
  expect(mocks.external).not.toHaveBeenCalled()
  await click(wrapper, '前往外站下载')
  await click(wrapper, '在浏览器中打开')
  expect(mocks.external).toHaveBeenCalledExactlyOnceWith(downloadLinks[0]!.url)
  expect(mocks.push).not.toHaveBeenCalled()
  expect(mocks.download).not.toHaveBeenCalled()
  expect(useWorkshopStore().wizardOpen).toBe(false)
})
test('platform packages and external downloads are displayed independently', async () => {
  route.params = { scnid: '2' }
  mocks.detail.mockResolvedValue({ ...project, downloadLinks })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('登录后下载')
  expect(wrapper.text()).toContain('前往外站下载')
})
test('external-only download deep links do not open platform download wizard or require login', async () => {
  route.params = { scnid: '2' }
  route.query = { download: 'true' }
  route.path = '/workshop/2'
  mocks.detail.mockResolvedValue({ ...project, approvedVersionId: null, downloadLinks })
  render()
  await flushPromises()
  expect(useWorkshopStore().wizardOpen).toBe(false)
  expect(mocks.replace).toHaveBeenCalledWith({ path: '/workshop/2', query: {} })
  expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.external).not.toHaveBeenCalled()
})
