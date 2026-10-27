import { expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../CreatorStatus.vue'
import zh from '../../../locales/zh.json'
vi.mock('../../../stores/creator', () => ({ useCreatorStore: () => ({ state: null, loading: false, load: async () => {}, redeem: async () => {} }) }))
vi.mock('../../../stores/content-center', () => ({ useContentCenterStore: () => ({ enabled: true }) }))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: () => {} }) }))
const button = defineComponent({ emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' })
const modal = defineComponent({ props: ['open'], template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>' })
test('unknown creator qualification still offers invitation entry without a retry button', async () => {
  const wrapper = mount(View, { global: { plugins: [createI18n({legacy:false,locale:'zh',flatJson:true,messages:{zh}}) as unknown as Plugin], stubs: { Button: button, Modal: modal, FormField: defineComponent({template:'<div><slot /></div>'}), Input: true } } })
  try {
    await flushPromises()
    expect(wrapper.text()).not.toContain('重试')
    const entry = wrapper.findAll('button').find(item => item.text() === '使用邀请码激活')!
    expect(entry.exists()).toBe(true)
    await entry.trigger('click')
    expect(wrapper.findComponent({ name: 'Input' }).exists()).toBe(true)
  } finally { wrapper.unmount() }
})
