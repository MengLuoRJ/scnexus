import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useContentCenterStore } from '../../../stores/content-center'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../WeeklyMutationsView.vue'
import zh from '../../../locales/zh'
const mocks = vi.hoisted(() => ({
  weekly: vi.fn<() => Promise<unknown>>(),
  catalog: vi.fn<() => Promise<unknown>>(),
  toast: vi.fn<(value: unknown) => void>(),
}))
vi.mock('../../../apis/weekly-mutations', () => ({
  mutationRegions: ['CN', 'NA', 'EU', 'AS'],
  mutationLanguages: ['zhCN', 'enUS', 'ruRU', 'koKR', 'frFR', 'deDE'],
  apiWeeklyMutation: mocks.weekly,
  apiMutatorCatalog: mocks.catalog,
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
const tabs = defineComponent({
  props: ['items', 'modelValue'],
  emits: ['update:modelValue'],
  template: `<div><button v-for="item in items" :key="item.value" @click="$emit('update:modelValue', item.value)">{{ item.label }}</button></div>`,
})
const input = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
})
const alert = defineComponent({
  props: ['title', 'description'],
  template: '<div role="alert">{{ title }} {{ description }}</div>',
})
const passthrough = defineComponent({ template: '<div><slot /></div>' })
const wrappers: { unmount(): void }[] = []
beforeEach(() => {
  setActivePinia(createPinia())
  useContentCenterStore().initialized = true
  vi.useFakeTimers()
  vi.setSystemTime('2026-10-23T00:00:00Z')
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.resetAllMocks()
})
function render(locale = 'zh') {
  const wrapper = mount(View, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale,
          flatJson: true,
          messages: { zh },
        }) as unknown as Plugin,
      ],
      stubs: {
        Tabs: tabs,
        Input: input,
        Alert: alert,
        Badge: passthrough,
        Button: passthrough,
        Progress: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
const factor = {
  id: 'demo',
  name: { zhCN: '测试因子', enUS: 'Demo' },
  description: '<b>纯文本</b>',
  communityScore: -1,
}
test('pending calibration renders local schedule and searchable catalog instead of a loading screen', async () => {
  mocks.weekly.mockReturnValue(new Promise(() => {}))
  mocks.catalog.mockReturnValue(new Promise(() => {}))
  const wrapper = render()
  expect(wrapper.findAll('article').length).toBeGreaterThan(0)
  expect(wrapper.find('[role="status"]').exists()).toBe(false)
  await wrapper.findAllComponents(tabs)[0]!.findAll('button')[1]!.trigger('click')
  expect(wrapper.findAll('article').length).toBeGreaterThan(0)
  expect(wrapper.find('input').exists()).toBe(true)
  expect(wrapper.find('[role="status"]').exists()).toBe(false)
})
test('renders projected status and plain text, then searches catalog in Chinese and English', async () => {
  mocks.weekly.mockResolvedValue({
    available: true,
    dataStatus: 'projected',
    startsAt: '2026-10-19T00:00:00Z',
    endsAt: '2026-10-26T00:00:00Z',
    lastVerifiedAt: null,
    mutation: {
      name: { zhCN: '测试主题' },
      map: { name: { zhCN: '测试地图' } },
      mutators: [factor],
    },
  })
  mocks.catalog.mockResolvedValue({
    revision: 1,
    items: [factor, { ...factor, id: 'other', name: { zhCN: '其他因子' }, description: '其他' }],
  })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('轮换推算')
  const expectedStart = new Intl.DateTimeFormat('zh-CN', {
    timeZoneName: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date('2026-10-19T00:00:00Z'))
  expect(wrapper.text()).toContain(expectedStart)
  expect(wrapper.text()).not.toContain('北京时间')
  expect(wrapper.text()).not.toContain('不代表本周已逐项人工核验')
  expect(wrapper.find('article b').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('最近核验')
  await wrapper.findAll('button')[1]!.trigger('click')
  expect(wrapper.findAll('article')).toHaveLength(2)
  expect(wrapper.text()).not.toContain('社区评分')
  await wrapper.find('input').setValue('demo')
  expect(wrapper.findAll('article')).toHaveLength(1)
  await wrapper.find('input').setValue('不匹配')
  expect(wrapper.text()).toContain('没有匹配的突变因子')
})
test.each(['NO_SCHEDULE', 'OUTSIDE_VALIDITY'])(
  'unavailable schedule %s is not a failure toast',
  async (reason) => {
    mocks.weekly.mockResolvedValue({ available: false, reason })
    mocks.catalog.mockResolvedValue({ revision: 1, items: [] })
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).not.toContain('暂无本周安排')
    expect(wrapper.findAll('article').length).toBeGreaterThan(0)
    expect(mocks.toast).not.toHaveBeenCalled()
  },
)

test('server switcher requests selected region without a language selector', async () => {
  mocks.weekly.mockResolvedValue({ available: false, reason: 'NO_SCHEDULE' })
  mocks.catalog.mockResolvedValue({ revision: 1, items: [] })
  const wrapper = render()
  await flushPromises()
  const regionTabs = wrapper.findAllComponents(tabs)[1]!
  await regionTabs.findAll('button')[2]!.trigger('click')
  await flushPromises()
  expect(mocks.weekly).toHaveBeenLastCalledWith('EU', 'zhCN')
  expect(wrapper.find('select').exists()).toBe(false)
  expect(wrapper.find('[aria-label="资料语言"]').exists()).toBe(false)
  await wrapper.findAllComponents(tabs)[0]!.findAll('button')[1]!.trigger('click')
  expect(wrapper.findAllComponents(tabs)).toHaveLength(1)
  await wrapper.findAllComponents(tabs)[0]!.findAll('button')[0]!.trigger('click')
  expect(wrapper.findAllComponents(tabs)[1]!.props('modelValue')).toBe('EU')
})
test.each([
  ['en', 'enUS'],
  ['zh-Hant', 'zhCN'],
])('data language follows application locale %s', async (locale, expected) => {
  mocks.weekly.mockResolvedValue({ available: false, reason: 'NO_SCHEDULE' })
  mocks.catalog.mockResolvedValue({ revision: 1, items: [] })
  render(locale)
  await flushPromises()
  expect(mocks.weekly).toHaveBeenLastCalledWith('CN', expected)
  expect(mocks.catalog).toHaveBeenLastCalledWith(expected)
})
