import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import AiUsageDetails from '../AiUsageDetails.vue'
import zh from '../../../locales/zh'

test('AI disclosures distinguish false from missing and null and update on record changes', async () => {
  const wrapper = mount(AiUsageDetails, {
    props: {
      value: { aiAssistedDevelopment: true, aiGeneratedArt: false, aiGeneratedVoice: null },
    },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          flatJson: true,
          locale: 'zh',
          messages: { zh },
        }) as unknown as Plugin,
      ],
    },
  })
  expect(wrapper.findAll('dd').map((d) => d.text())).toEqual(['使用', '未使用', '未声明'])
  await wrapper.setProps({ value: {} })
  expect(wrapper.findAll('dd').map((d) => d.text())).toEqual(['未声明', '未声明', '未声明'])
  wrapper.unmount()
})
