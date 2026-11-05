import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Component, Plugin } from 'vue'
import Community from '../../../components/workshop/WorkshopCommunity.vue'
import Favorites from '../../../components/workshop/WorkshopFavorites.vue'
import { AccountError } from '../../../apis/internal/client'
import zh from '../../../locales/zh'
const state = reactive({ signedIn: true, snapshot: { epoch: 1, sessionId: 'one' }, httpAuth: {} })
const api = vi.hoisted(() => ({
  summary: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  reviews: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  mine: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  favorite: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  set: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  create: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  update: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  favorites: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  toast: vi.fn<(value: unknown) => void>(),
  push: vi.fn<(value: unknown) => Promise<void>>(),
}))
vi.mock('../../../stores/auth', () => ({ useAuthStore: () => state }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/workshop/2' }),
  useRouter: () => ({ push: api.push }),
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: api.toast }) }))
vi.mock('../../../apis/workshop-community', () => ({
  apiWorkshopCommunitySummary: api.summary,
  apiWorkshopReviews: api.reviews,
  apiWorkshopMyReview: api.mine,
  apiWorkshopFavorite: api.favorite,
  apiWorkshopSetFavorite: api.set,
  apiWorkshopCreateReview: api.create,
  apiWorkshopUpdateReview: api.update,
  apiWorkshopFavorites: api.favorites,
}))
const button = defineComponent({
  props: ['disabled', 'type'],
  template: '<button :type="type" :disabled="disabled"><slot /></button>',
})
const pass = defineComponent({
  props: ['title'],
  template: '<div>{{ title }}<slot /><slot name="actions" /></div>',
})
const textarea = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', ($event.target).value)" />',
})
const wrappers: { unmount(): void }[] = []
function render(component: Component = Community) {
  api.summary.mockResolvedValue({
    totalReviews: 1,
    positiveReviews: 1,
    negativeReviews: 0,
    positiveRate: 100,
    recommendation: '好评',
    favoriteCount: 0,
  })
  api.reviews.mockResolvedValue({
    items: [
      {
        id: 'review',
        reviewerNickname: '玩家',
        recommended: true,
        text: '<img src=x onerror=alert(1)>',
        createdAt: '2026-11-05',
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  })
  api.favorite.mockResolvedValue({ scnid: 2, favorited: false })
  const wrapper = mount(component, {
    props: { scnid: 2 },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          flatJson: true,
          locale: 'zh',
          messages: { zh },
        }) as unknown as Plugin,
      ],
      stubs: {
        Button: button,
        Alert: pass,
        Badge: pass,
        FormField: pass,
        Textarea: textarea,
        Card: pass,
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
  state.snapshot = { epoch: 1, sessionId: 'one' }
})
test('anonymous public reviews render text without HTML or private requests', async () => {
  state.signedIn = false
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
  expect(wrapper.find('img').exists()).toBe(false)
  expect(api.mine).not.toHaveBeenCalled()
  expect(api.favorite).not.toHaveBeenCalled()
})
test('creates an optional-text vote and refreshes public statistics', async () => {
  api.mine.mockResolvedValue(null)
  api.create.mockResolvedValue({
    recommended: true,
    text: '',
    revision: 0,
    textVisible: false,
    visibilitySource: 'PENDING',
  })
  const wrapper = render()
  await flushPromises()
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(api.create).toHaveBeenCalledWith(state.httpAuth, 2, { recommended: true, text: '' })
  expect(api.summary).toHaveBeenCalledTimes(2)
})
test('conflict preserves draft, shows latest content and requires another explicit submit', async () => {
  api.mine
    .mockResolvedValueOnce({ recommended: true, text: 'old', revision: 2 })
    .mockResolvedValue({ recommended: false, text: 'latest', revision: 3 })
  api.update
    .mockRejectedValueOnce(new AccountError('conflict'))
    .mockResolvedValue({ recommended: true, text: 'draft', revision: 4 })
  const wrapper = render()
  await flushPromises()
  await wrapper.find('textarea').setValue('draft')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(api.update).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('latest')
  expect(wrapper.find('textarea').element.value).toBe('draft')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(api.update).toHaveBeenLastCalledWith(state.httpAuth, 2, {
    recommended: true,
    text: 'draft',
    expectedRevision: 3,
  })
})
test('session change clears private state and ignores an older pending response', async () => {
  let resolve!: (value: unknown) => void
  api.mine.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r
    }),
  )
  const wrapper = render()
  await flushPromises()
  state.signedIn = false
  state.snapshot.epoch++
  await flushPromises()
  resolve({ text: 'secret', recommended: true, revision: 1 })
  await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('secret')
})
test('favorite change is submitted once and updates the displayed state', async () => {
  api.mine.mockResolvedValue(null)
  api.set.mockResolvedValue({ scnid: 2, favorited: true })
  const wrapper = render()
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '收藏')!
    .trigger('click')
  await flushPromises()
  expect(api.set).toHaveBeenCalledWith(state.httpAuth, 2, true)
  expect(wrapper.text()).toContain('取消收藏')
})
function reviewPage(page: number, total: number, text = `page-${page}`) {
  return {
    items:
      total > (page - 1) * 20
        ? [{ id: text, reviewerNickname: '玩家', recommended: true, text, createdAt: '2026-11-05' }]
        : [],
    total,
    page,
    limit: 20,
  }
}
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
test.each([20, 0])(
  'editing on the last page clamps to page one when total drops to %i',
  async (total) => {
    api.mine.mockResolvedValue({ recommended: true, text: 'old', revision: 1 })
    api.update.mockResolvedValue({ recommended: true, text: 'updated', revision: 2 })
    api.reviews.mockResolvedValueOnce(reviewPage(1, 21))
    const wrapper = render()
    await flushPromises()
    api.reviews.mockResolvedValueOnce(reviewPage(2, 21))
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '下一页')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('nav span').text()).toBe('2')
    api.reviews
      .mockResolvedValueOnce(reviewPage(2, total))
      .mockResolvedValueOnce(reviewPage(1, total, 'remaining-review'))
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.reviews).toHaveBeenLastCalledWith(2, 1)
    expect(wrapper.find('nav').exists()).toBe(false)
    expect(wrapper.text()).toContain(total ? 'remaining-review' : '暂无公开文字评价')
  },
)
test('a delayed write refresh cannot replace a newer page response', async () => {
  api.mine.mockResolvedValue(null)
  api.set.mockResolvedValue({ scnid: 2, favorited: true })
  api.reviews.mockResolvedValueOnce(reviewPage(1, 40))
  const wrapper = render()
  await flushPromises()
  const older = deferred()
  api.reviews.mockReturnValueOnce(older.promise)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '收藏')!
    .trigger('click')
  await flushPromises()
  expect(
    wrapper
      .findAll('button')
      .find((b) => b.text() === '下一页')!
      .attributes('disabled'),
  ).toBeDefined()
  api.reviews.mockResolvedValueOnce(reviewPage(2, 40, 'new-page'))
  // Emit directly to verify request ordering independently of the disabled button.
  wrapper
    .findAllComponents(button)
    .find((b) => b.text() === '下一页')!
    .vm.$emit('click')
  await flushPromises()
  expect(wrapper.find('nav span').text()).toBe('2')
  older.resolve(reviewPage(1, 40, 'stale-page'))
  await flushPromises()
  expect(wrapper.find('nav span').text()).toBe('2')
  expect(wrapper.text()).toContain('new-page')
  expect(wrapper.text()).not.toContain('stale-page')
})
test('an obsolete list failure does not report an error or finish a newer request', async () => {
  api.mine.mockResolvedValue(null)
  api.set.mockResolvedValue({ scnid: 2, favorited: true })
  api.reviews.mockResolvedValueOnce(reviewPage(1, 40))
  const wrapper = render()
  await flushPromises()
  const older = deferred()
  const newer = deferred()
  api.reviews.mockReturnValueOnce(older.promise)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '收藏')!
    .trigger('click')
  await flushPromises()
  api.reviews.mockReturnValueOnce(newer.promise)
  wrapper
    .findAllComponents(button)
    .find((b) => b.text() === '下一页')!
    .vm.$emit('click')
  await flushPromises()
  older.reject(new AccountError('network'))
  await flushPromises()
  expect(api.toast).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  expect(
    wrapper
      .findAll('button')
      .find((b) => b.text() === '下一页')!
      .attributes('disabled'),
  ).toBeDefined()
  newer.resolve(reviewPage(2, 40, 'newest-page'))
  await flushPromises()
  expect(wrapper.text()).toContain('newest-page')
  expect(wrapper.find('nav span').text()).toBe('2')
})
test('a failed clamped-page request retains a usable previous-page action', async () => {
  api.mine.mockResolvedValue(null)
  api.set.mockResolvedValue({ scnid: 2, favorited: true })
  api.reviews.mockResolvedValueOnce(reviewPage(1, 21))
  const wrapper = render()
  await flushPromises()
  api.reviews.mockResolvedValueOnce(reviewPage(2, 21))
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  api.reviews
    .mockResolvedValueOnce(reviewPage(2, 20))
    .mockRejectedValueOnce(new AccountError('network'))
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '收藏')!
    .trigger('click')
  await flushPromises()
  const previous = wrapper.findAll('button').find((b) => b.text() === '上一页')!
  expect(previous.attributes('disabled')).toBeUndefined()
  api.reviews.mockResolvedValueOnce(reviewPage(1, 20, 'recovered-page'))
  await previous.trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('recovered-page')
})
test('favorites are private and remove through the idempotent favorite endpoint', async () => {
  api.favorites.mockResolvedValue({
    items: [{ scnid: 2, title: '收藏作品', description: '' }],
    total: 1,
    page: 1,
    limit: 12,
  })
  api.set.mockResolvedValue({ scnid: 2, favorited: false })
  const wrapper = render(Favorites)
  await flushPromises()
  expect(wrapper.text()).toContain('收藏作品')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '取消收藏')!
    .trigger('click')
  await flushPromises()
  expect(api.set).toHaveBeenCalledWith(state.httpAuth, 2, false)
  state.signedIn = false
  await flushPromises()
  expect(wrapper.text()).not.toContain('收藏作品')
})
