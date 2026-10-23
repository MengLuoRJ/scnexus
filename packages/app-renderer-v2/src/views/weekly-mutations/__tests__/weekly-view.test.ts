import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../WeeklyMutationsView.vue'
import zh from '../../../locales/zh.json'
const mocks = vi.hoisted(() => ({
  weekly: vi.fn<() => Promise<unknown>>(),
  catalog: vi.fn<() => Promise<unknown>>(),
  toast: vi.fn<(value: unknown) => void>(),
}))
vi.mock('../../../apis/weekly-mutations', () => ({
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
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.resetAllMocks()
})
function render() {
  const wrapper = mount(View, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'zh',
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
test('renders projected status and plain text, then searches catalog in Chinese and English', async () => {
  mocks.weekly.mockResolvedValue({
    available: true,
    dataStatus: 'projected',
    startsAt: '2099-01-01T00:00:00Z',
    endsAt: '2099-01-08T00:00:00Z',
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
    expect(wrapper.text()).toContain('暂无本周安排')
    expect(mocks.toast).not.toHaveBeenCalled()
  },
)
