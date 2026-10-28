import { expect, test } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import type { InstallPreview } from '@scnexus/app-shared/types/content.type'
import LauncherChoice from '../../../components/content/LauncherChoice.vue'
import zh from '../../../locales/zh.json'
const select = defineComponent({
  props: ['items', 'modelValue'],
  emits: ['update:modelValue'],
  template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>`,
})
function render(source: 'manifest' | 'detected' | 'none') {
  const preview = {
    package: { type: 'customize' },
    launcher: {
      source,
      target: source === 'none' ? null : 'Maps/Launcher.SC2Map',
      candidates: [
        { name: 'Launcher.SC2Map', target: 'Maps/Launcher.SC2Map' },
        { name: 'Other.SC2Map', target: 'Maps/Other.SC2Map' },
      ],
    },
  } as unknown as InstallPreview
  return mount(LauncherChoice, {
    props: { preview, modelValue: preview.launcher?.target ?? null },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'zh',
          flatJson: true,
          messages: { zh },
        }) as unknown as Plugin,
      ],
      stubs: { Select: select },
    },
  })
}
test('manifest launcher is visible but cannot be changed', () => {
  const wrapper = render('manifest')
  expect(wrapper.text()).toContain('Maps/Launcher.SC2Map')
  expect(wrapper.find('select').exists()).toBe(false)
  wrapper.unmount()
})
test.each(['detected', 'none'] as const)(
  '%s launcher allows explicit map selection or clearing',
  async (source) => {
    const wrapper = render(source)
    await wrapper.find('select').setValue('Maps/Other.SC2Map')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Maps/Other.SC2Map'])
    await wrapper.find('select').setValue('__none__')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([null])
    wrapper.unmount()
  },
)
