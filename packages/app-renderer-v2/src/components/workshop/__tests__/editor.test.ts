import { expect, test, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import WorkshopEditor from '../WorkshopEditor.vue'
import zh from '../../../locales/workshop.zh.json'
test('Nuxt UI editor mounts with restricted JSON extensions and emits canonical content', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  const wrapper = mount(WorkshopEditor, {
    props: {
      modelValue: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft text' }] }],
      },
    },
    global: {
      plugins: [
        ui,
        createI18n({
          legacy: false,
          locale: 'zh',
          flatJson: true,
          messages: { zh },
        }) as unknown as Plugin,
      ],
    },
  })
  try {
    await flushPromises()
    expect(wrapper.text()).toContain('Draft text')
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('富文本内容不符合')
  } finally {
    wrapper.unmount()
    vi.unstubAllGlobals()
  }
})
