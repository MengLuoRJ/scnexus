import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../EncodingView.vue'
import zh from '../../../locales/zh'
const mocks = vi.hoisted(() => ({ toast: vi.fn<(value: unknown) => void>() }))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
const textarea = defineComponent({
  props: ['modelValue', 'readonly'],
  emits: ['update:modelValue'],
  template:
    '<textarea :value="modelValue" :readonly="readonly" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})
const tabs = defineComponent({
  props: ['items', 'modelValue'],
  emits: ['update:modelValue'],
  template:
    '<div><button v-for="item in items" :key="item.value" @click="$emit(\'update:modelValue\',item.value)">{{ item.label }}</button></div>',
})
const button = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})
const pass = defineComponent({ template: '<div><slot /></div>' })
afterEach(() => vi.restoreAllMocks())
test('changes formats, keeps output readonly and copies exact code with feedback', async () => {
  const copy = vi.fn<(value: string) => Promise<void>>(async () => {})
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
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
      stubs: { Textarea: textarea, Tabs: tabs, Button: button, FormField: pass },
    },
  })
  try {
    await wrapper.findAll('textarea')[0]!.setValue('测试')
    await wrapper
      .findAll('button')
      .find((item) => item.text() === '作为文本（Text）')!
      .trigger('click')
    const output = wrapper.findAll('textarea')[1]!
    expect(output.attributes('readonly')).toBeDefined()
    expect((output.element as HTMLTextAreaElement).value).toBe(
      'StringToText("\\xe6\\xb5\\x8b\\xe8\\xaf\\x95")',
    )
    await wrapper
      .findAll('button')
      .find((item) => item.text() === '复制结果')!
      .trigger('click')
    await flushPromises()
    expect(copy).toHaveBeenCalledWith('StringToText("\\xe6\\xb5\\x8b\\xe8\\xaf\\x95")')
    expect(mocks.toast).toHaveBeenCalledWith({ color: 'success', title: '转换结果已复制' })
    copy.mockRejectedValueOnce(new Error('denied'))
    await wrapper
      .findAll('button')
      .find((item) => item.text() === '复制结果')!
      .trigger('click')
    await flushPromises()
    expect(mocks.toast).toHaveBeenCalledWith({
      color: 'error',
      title: '复制失败，请手动选择结果复制。',
    })
    await wrapper
      .findAll('button')
      .find((item) => item.text() === '一键清空')!
      .trigger('click')
    expect((wrapper.findAll('textarea')[0]!.element as HTMLTextAreaElement).value).toBe('')
    expect((wrapper.findAll('textarea')[1]!.element as HTMLTextAreaElement).value).toBe('')
    expect(
      wrapper
        .findAll('button')
        .find((item) => item.text() === '复制结果')!
        .attributes('disabled'),
    ).toBeDefined()
  } finally {
    wrapper.unmount()
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
})
