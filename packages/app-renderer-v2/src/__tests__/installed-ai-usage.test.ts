import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { ContentRecord } from '@scnexus/app-shared/types/content.type'
import RecordDetails from '../components/content/RecordDetails.vue'
import CampaignDetails from '../views/campaign/components/CampaignDetails.vue'

vi.mock('../ipcs/content', () => ({
  ipcContentAssets: vi.fn<() => Promise<unknown>>(async () => ({ success: true, data: null })),
}))
const aiDetails = defineComponent({
  name: 'AiUsageDetails',
  props: ['value'],
  template: '<div data-ai-usage />',
})
const passThrough = defineComponent({ template: '<div><slot /></div>' })
const wrappers: { unmount: () => void }[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})
function record(type: 'campaign' | 'customize' | 'dependency', declared: boolean): ContentRecord {
  return {
    localId: 'installed',
    package: {
      name: 'Installed content',
      description: '',
      author: 'Author',
      version: '1',
      ...(type === 'campaign' ? { type, campaign: 'WOL' as const } : { type }),
      ...(declared ? { aiAssistedDevelopment: false, aiGeneratedArt: true } : {}),
    },
    mode: 'scnexus',
    fileCount: 0,
    files: [],
    bytes: 0,
    managementDirectory: 'D:\\Game\\Library',
    origin: 'package-json',
    source: null,
    rootRelativePath: '',
    descriptorPath: 'D:\\Game\\Library\\package.json',
    payloadDirectory: null,
    ccmOriginal: null,
    installedFiles: [],
    sourceTree: null,
    targetTree: { kind: 'directory', name: 'GameRoot', path: '', bytes: 0, modifiedAt: null },
    importedAt: 0,
    gameRoot: 'D:\\Game',
  }
}
function globalOptions() {
  return {
    plugins: [createI18n({ legacy: false, locale: 'zh', missingWarn: false, fallbackWarn: false })],
    stubs: {
      AiUsageDetails: aiDetails,
      UCard: passThrough,
      UTabs: true,
      UModal: true,
      UButton: true,
      UBadge: passThrough,
    },
  }
}
test.each(['campaign', 'customize', 'dependency'] as const)(
  'installed %s details forwards declared and undeclared package values without coercion',
  async (type) => {
    const current = record(type, true)
    const wrapper = mount(RecordDetails, {
      props: { record: current },
      global: globalOptions(),
    })
    wrappers.push(wrapper)
    expect(wrapper.findComponent(aiDetails).props('value')).toEqual(current.package)
    expect(wrapper.findComponent(aiDetails).props('value').aiAssistedDevelopment).toBe(false)
    expect(wrapper.findComponent(aiDetails).props('value').aiGeneratedVoice).toBeUndefined()
    const undeclared = record(type, false)
    await wrapper.setProps({ record: undeclared })
    expect(wrapper.findComponent(aiDetails).props('value')).toEqual(undeclared.package)
    expect(wrapper.findComponent(aiDetails).props('value')).not.toHaveProperty('aiGeneratedArt')
  },
)
test('campaign main panel shows installed package declarations, not official campaign declarations', async () => {
  const current = record('campaign', true)
  const wrapper = mount(CampaignDetails, {
    props: { current, busy: false, available: true, modelValue: 'WOL' },
    global: globalOptions(),
  })
  wrappers.push(wrapper)
  expect(wrapper.findComponent(aiDetails).props('value')).toEqual(current.package)
  await wrapper.setProps({ current: null })
  expect(wrapper.findComponent(aiDetails).exists()).toBe(false)
})
