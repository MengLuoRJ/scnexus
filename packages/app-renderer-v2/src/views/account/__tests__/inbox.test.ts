import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, reactive, shallowRef } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import InboxPanel from '../InboxPanel.vue'
import InboxBody from '../InboxBody.vue'
import { inboxNavigation } from '../inbox-link'
import zh from '../../../locales/zh'
const state = reactive({
  signedIn: true,
  officialServicesEnabled: true,
  snapshot: { epoch: 1, sessionId: 'one' },
  httpAuth: {},
})
const api = vi.hoisted(() => ({
  list: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  count: vi.fn<() => Promise<number>>(),
  read: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  all: vi.fn<() => Promise<number>>(),
  toast: vi.fn<(value: unknown) => void>(),
}))
vi.mock('../../../stores/auth', () => ({ useAuthStore: () => state }))
vi.mock('../../../stores/content-center', () => ({ useContentCenterStore: () => state }))
vi.mock('../../../apis/inbox', () => ({
  apiInboxList: api.list,
  apiInboxUnreadCount: api.count,
  apiInboxRead: api.read,
  apiInboxReadAll: api.all,
}))
vi.mock('../../../composables/useInboxRealtime', () => ({
  useInboxRealtime: () => ({ status: shallowRef('unavailable') }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: async () => {} }) }))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: api.toast }) }))
const message = {
  id: '11111111-1111-4111-8111-111111111111',
  title: '维护通知',
  body: '**请保存进度**',
  businessType: 'SYSTEM',
  businessId: 'business-not-notification',
  link: null,
  audience: 'USERS',
  publishedAt: '2026-11-01T00:00:00Z',
  readAt: null,
}
const button = defineComponent({
  props: ['disabled', 'loading'],
  template: '<button :disabled="disabled || loading"><slot /></button>',
})
const pass = defineComponent({
  props: ['title', 'description'],
  template: '<div>{{ title }}{{ description }}<slot /><slot name="actions" /></div>',
})
const modal = defineComponent({
  props: ['open', 'title'],
  template:
    '<div v-if="open" role="dialog">{{ title }}<slot name="body" /><slot name="footer" /></div>',
})
const tabs = defineComponent({
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  template:
    '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
})
const plugins = () => [
  createI18n({
    legacy: false,
    flatJson: true,
    locale: 'zh',
    messages: { zh },
  }) as unknown as Plugin,
]
const wrappers: { unmount(): void }[] = []
function render() {
  api.count.mockResolvedValue(3)
  const wrapper = mount(InboxPanel, {
    global: {
      plugins: plugins(),
      stubs: {
        Button: button,
        Card: pass,
        Alert: pass,
        Badge: pass,
        Modal: modal,
        Tabs: tabs,
        Progress: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.resetAllMocks()
  state.signedIn = true
  state.officialServicesEnabled = true
  state.snapshot = { epoch: 1, sessionId: 'one' }
})
test('personal inbox loads list/count and marks notification id, never business id', async () => {
  api.list.mockResolvedValue({ items: [message], page: 1, limit: 20, hasMore: false })
  api.read.mockResolvedValue(true)
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('3 条未读')
  await wrapper
    .findAll('button')
    .find((b) => b.text().includes('维护通知'))!
    .trigger('click')
  expect(api.read).not.toHaveBeenCalled()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '标为已读')!
    .trigger('click')
  await flushPromises()
  expect(api.read).toHaveBeenCalledWith(state.httpAuth, message.id)
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})
test('failed refresh preserves old messages and unread count with an error', async () => {
  api.list
    .mockResolvedValueOnce({ items: [message], page: 1, limit: 20, hasMore: false })
    .mockRejectedValue(new Error('offline'))
  const wrapper = render()
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '刷新')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('维护通知')
  expect(wrapper.text()).toContain('3 条未读')
  expect(wrapper.text()).toContain('消息刷新失败')
})
test('session change clears messages and ignores late responses', async () => {
  let resolve!: (value: unknown) => void
  api.list.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const wrapper = render()
  state.signedIn = false
  state.snapshot.epoch++
  await flushPromises()
  resolve({ items: [message], page: 1, limit: 20, hasMore: false })
  await flushPromises()
  expect(wrapper.text()).not.toContain('维护通知')
  expect(api.count).not.toHaveBeenCalled()
})
test('all-read uses an empty action wrapper and refreshes rather than guessing count', async () => {
  api.list.mockResolvedValue({ items: [message], page: 1, limit: 20, hasMore: false })
  api.all.mockResolvedValue(2)
  const wrapper = render()
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '全部已读')!
    .trigger('click')
  await flushPromises()
  expect(api.all).toHaveBeenCalledWith(state.httpAuth)
  expect(api.count).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain('3 条未读')
})
test('filter changes ignore an older response and return empty removed pages to first page', async () => {
  api.list.mockResolvedValueOnce({ items: [message], page: 1, limit: 20, hasMore: true })
  const wrapper = render()
  await flushPromises()
  let resolve!: (value: unknown) => void
  api.list.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '下一页')!
    .trigger('click')
  api.list.mockResolvedValueOnce({ items: [], page: 1, limit: 20, hasMore: false })
  await wrapper.find('select').setValue('unread')
  await flushPromises()
  resolve({ items: [message], page: 2, limit: 20, hasMore: false })
  await flushPromises()
  expect(wrapper.text()).not.toContain('维护通知')
  expect(wrapper.text()).toContain('暂无消息')
})
test('empty filtered last page falls back to the first page after marking read', async () => {
  api.list.mockResolvedValueOnce({ items: [message], page: 1, limit: 20, hasMore: true })
  api.all.mockResolvedValue(1)
  const wrapper = render()
  await flushPromises()
  api.list.mockResolvedValueOnce({ items: [message], page: 2, limit: 20, hasMore: false })
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  api.list
    .mockResolvedValueOnce({ items: [], page: 2, limit: 20, hasMore: false })
    .mockResolvedValueOnce({ items: [], page: 1, limit: 20, hasMore: false })
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '全部已读')!
    .trigger('click')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith(state.httpAuth, 'all', 1)
  expect(wrapper.find('nav').exists()).toBe(false)
})
test('failed marking retains the message and does not report success', async () => {
  api.list.mockResolvedValue({ items: [message], page: 1, limit: 20, hasMore: false })
  api.all.mockRejectedValue(new Error('offline'))
  const wrapper = render()
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '全部已读')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('维护通知')
  expect(api.toast).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  expect(api.list).toHaveBeenCalledTimes(1)
})
test('official services disabled performs no inbox requests', async () => {
  state.officialServicesEnabled = false
  const wrapper = render()
  await flushPromises()
  expect(api.list).not.toHaveBeenCalled()
  expect(wrapper.text()).toBe('')
})
test('unread-count failure preserves both previous count and previous list', async () => {
  api.list.mockResolvedValueOnce({ items: [message], page: 1, limit: 20, hasMore: false })
  const wrapper = render()
  await flushPromises()
  api.list.mockResolvedValueOnce({ items: [], page: 1, limit: 20, hasMore: false })
  api.count.mockRejectedValueOnce(new Error('count unavailable'))
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '刷新')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('维护通知')
  expect(wrapper.text()).toContain('3 条未读')
  expect(wrapper.text()).toContain('消息刷新失败')
})
test('late mark completion cannot update another account or trigger its refresh', async () => {
  api.list.mockResolvedValue({ items: [message], page: 1, limit: 20, hasMore: false })
  let resolve!: (value: number) => void
  api.all.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const wrapper = render()
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '全部已读')!
    .trigger('click')
  state.signedIn = false
  await flushPromises()
  resolve(1)
  await flushPromises()
  expect(api.list).toHaveBeenCalledTimes(1)
  expect(api.toast).not.toHaveBeenCalled()
  expect(wrapper.text()).toBe('')
})
test('restricted markdown never creates links, images, HTML or application components', async () => {
  const wrapper = mount(InboxBody, {
    props: {
      body: '# 标题\n\n**强调** [link](https://evil.invalid) ![pixel](https://evil.invalid/a) <img src="x" onerror="alert(1)">\n\n::UButton\nhttps://evil.invalid\n\n`code`',
    },
    global: { plugins: plugins() },
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.find('strong').text()).toBe('强调')
  expect(wrapper.find('h1').text()).toBe('标题')
  expect(wrapper.find('code').text()).toBe('code')
  expect(wrapper.find('a,img,button,iframe,script').exists()).toBe(false)
})
test('navigation allows only known local routes or explicit HTTPS activity links', () => {
  expect(inboxNavigation({ businessType: 'SERVICE_LINK', link: '/workshop/2' })).toEqual({
    kind: 'internal',
    target: '/workshop/2',
  })
  for (const link of [
    '//evil.invalid',
    '/../settings',
    '/settings?redirect=https://evil.invalid',
    '/services/status',
    '/workshop/%32',
  ])
    expect(inboxNavigation({ businessType: 'SERVICE_LINK', link })).toBeNull()
  expect(
    inboxNavigation({ businessType: 'ACTIVITY_LINK', link: 'https://events.example.test/a' }),
  ).toEqual({ kind: 'external', target: 'https://events.example.test/a' })
  for (const link of [
    'javascript:alert(1)',
    'http://evil.invalid',
    'https://user@evil.invalid',
    'https://evil.invalid\\a',
  ])
    expect(inboxNavigation({ businessType: 'ACTIVITY_LINK', link })).toBeNull()
  expect(
    inboxNavigation({ businessType: 'SYSTEM', link: 'https://events.example.test' }),
  ).toBeNull()
})
