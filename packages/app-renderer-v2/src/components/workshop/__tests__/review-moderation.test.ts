import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import View from '../WorkshopReviewModeration.vue'
import { AccountError } from '../../../apis/internal/client'
const mocks = vi.hoisted(() => ({
  list: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  visibility: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  toast: vi.fn<(value: unknown) => void>(),
}))
const state = reactive({ enabled: true, signedIn: true, active: true, epoch: 1, sessionId: 'one' })
vi.mock('../../../apis/workshop-community', () => ({
  apiWorkshopReviewModeration: mocks.list,
  apiWorkshopReviewVisibility: mocks.visibility,
}))
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({
    httpAuth: {},
    get signedIn() {
      return state.signedIn
    },
    snapshot: state,
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
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
const button = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})
const pass = defineComponent({ props: ['title'], template: '<div>{{ title }}<slot /></div>' })
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.resetAllMocks()
  Object.assign(state, { enabled: true, signedIn: true, active: true, epoch: 1, sessionId: 'one' })
})
function render() {
  const wrapper = mount(View, {
    props: { scnid: 1 },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'zh',
          missingWarn: false,
          fallbackWarn: false,
          messages: {},
        }),
      ],
      stubs: { Button: button, Card: pass, Alert: pass, Badge: pass, Progress: true },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
const review = {
  id: 'one',
  projectScnid: 1,
  reviewerNickname: 'Player',
  recommended: false,
  text: '<img src=x>',
  textHtml: '&lt;img src=x&gt;',
  textVisible: false,
  visibilitySource: 'PENDING',
  revision: 3,
  createdAt: '2026-11-05',
  updatedAt: '2026-11-05',
}
function list(items = [review], total = items.length) {
  return { items, total, page: 1, limit: 20 }
}
function buttonWith(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === `workshop.community.${text}`)!
}
test('renders text safely, includes negative votes, empty records and ADMIN decisions without forbidden actions', async () => {
  mocks.list.mockResolvedValue(
    list([
      review,
      { ...review, id: 'admin', visibilitySource: 'ADMIN', textVisible: true },
      { ...review, id: 'empty', text: '' },
    ]),
  )
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toContain('<img src=x>')
  expect(wrapper.text()).toContain('workshop.community.notRecommended')
  expect(wrapper.text()).toContain('workshop.community.adminLocked')
  expect(wrapper.text()).toContain('workshop.community.noReviewText')
  const showButtons = wrapper
    .findAll('button')
    .filter((button) => button.text() === 'workshop.community.showText')
  expect(showButtons).toHaveLength(2)
  expect(showButtons[1]!.attributes('disabled')).toBeDefined()
  expect(wrapper.find('textarea').exists()).toBe(false)
  mocks.visibility.mockResolvedValue({
    ...review,
    textVisible: true,
    visibilitySource: 'AUTHOR',
    revision: 4,
  })
  await showButtons[0]!.trigger('click')
  await flushPromises()
  expect(mocks.visibility).toHaveBeenCalledWith({}, 1, 'one', 3, true)
  expect(buttonWith(wrapper, 'hideText').exists()).toBe(true)
})
test('409 reloads latest revision and requires another explicit user click without replaying', async () => {
  mocks.list
    .mockResolvedValueOnce(list())
    .mockResolvedValueOnce(list([{ ...review, text: 'New content', revision: 4 }]))
  mocks.visibility.mockRejectedValueOnce(new AccountError('conflict'))
  const wrapper = render()
  await flushPromises()
  await buttonWith(wrapper, 'showText').trigger('click')
  await flushPromises()
  expect(mocks.list).toHaveBeenCalledTimes(2)
  expect(mocks.visibility).toHaveBeenCalledOnce()
  expect(wrapper.text()).toContain('New content')
  expect(wrapper.text()).toContain('workshop.community.moderationConflict')
  mocks.visibility.mockResolvedValueOnce({
    ...review,
    revision: 5,
    textVisible: true,
    visibilitySource: 'AUTHOR',
  })
  await buttonWith(wrapper, 'showText').trigger('click')
  await flushPromises()
  expect(mocks.visibility).toHaveBeenLastCalledWith({}, 1, 'one', 4, true)
})
test('paginates without filtering away hidden or textless votes', async () => {
  mocks.list.mockResolvedValue(list([review], 21))
  const wrapper = render()
  await flushPromises()
  await buttonWith(wrapper, 'next').trigger('click')
  await flushPromises()
  expect(mocks.list).toHaveBeenLastCalledWith({}, 1, 2, 20)
})
test('project and session changes discard stale reads', async () => {
  let resolve!: (value: unknown) => void
  mocks.list
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    .mockResolvedValue(list([{ ...review, text: 'Project two' }]))
  const wrapper = render()
  await wrapper.setProps({ scnid: 2 })
  await flushPromises()
  resolve(list([{ ...review, text: 'Stale one' }]))
  await flushPromises()
  expect(wrapper.text()).toContain('Project two')
  expect(wrapper.text()).not.toContain('Stale one')
  state.signedIn = false
  state.epoch++
  await flushPromises()
  expect(wrapper.text()).not.toContain('Project two')
})
test('stale mutation cannot replace another project data or emit success', async () => {
  let resolve!: (value: unknown) => void
  mocks.list.mockResolvedValue(list())
  mocks.visibility.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const wrapper = render()
  await flushPromises()
  await buttonWith(wrapper, 'showText').trigger('click')
  mocks.list.mockResolvedValueOnce(list([{ ...review, text: 'Other project' }]))
  await wrapper.setProps({ scnid: 2 })
  await flushPromises()
  resolve({ ...review, text: 'Stale write', textVisible: true })
  await flushPromises()
  expect(wrapper.text()).toContain('Other project')
  expect(wrapper.text()).not.toContain('Stale write')
  expect(mocks.toast).not.toHaveBeenCalled()
})
test('disabled or inactive creators do not read moderation', async () => {
  state.active = false
  const wrapper = render()
  await flushPromises()
  expect(mocks.list).not.toHaveBeenCalled()
  expect(wrapper.findAll('article')).toHaveLength(0)
})
