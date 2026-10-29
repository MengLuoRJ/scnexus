import { beforeEach, expect, test, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import type { ContentRecord } from '@scnexus/app-shared/types/content.type'
import RecordDetails from '../content/RecordDetails.vue'
import CampaignDetails from '../../views/campaign/components/CampaignDetails.vue'
import PackageMarkdown from '../content/PackageMarkdown.vue'
import zh from '../../locales/zh.json'
const ipc = vi.hoisted(() => ({ ipcContentAssets: vi.fn<(localId: string) => Promise<unknown>>() }))
vi.mock('../../ipcs/content', () => ipc)
const record = {
  localId: 'one',
  package: { name: 'Test', description: 'Description', author: 'Author', campaign: 'WOL' },
  mode: 'scnexus',
  files: [],
  fileCount: 0,
  bytes: 0,
  targetTree: { children: [] },
  launcherTarget: 'Maps/Launcher.SC2Map',
  managementDirectory: 'D:\\Packages\\one',
  payloadDirectory: 'D:\\Game\\one',
} as unknown as ContentRecord
const pass = { template: '<div><slot /></div>' }
const tabs = defineComponent({
  props: ['items', 'modelValue'],
  emits: ['update:modelValue'],
  template:
    '<nav><button v-for="item in items" :key="item.value" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></nav>',
})
function global() {
  return {
    plugins: [createI18n({ legacy: false, locale: 'zh', flatJson: true, messages: { zh } })],
    stubs: {
      Tabs: tabs,
      Button: { template: '<button><slot /></button>' },
      Card: pass,
      Badge: pass,
      FileTree: true,
      PackageMarkdown: {
        props: ['path', 'localId', 'fragment'],
        template: '<article>{{ path }}</article>',
      },
      Modal: { props: ['open'], template: '<aside v-if="open"><slot name="body" /></aside>' },
    },
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  ipc.ipcContentAssets.mockResolvedValue({
    ok: true,
    data: { image: null, readme: null, changelog: null, docs: [] },
  })
})
test('empty indexes show only details and file tree, never a document heading or empty panel', async () => {
  const view = mount(RecordDetails, { props: { record }, global: global() })
  await flushPromises()
  expect(view.findAll('nav button').map((button) => button.text())).toEqual(['详情', '目标文件树'])
  expect(view.text()).toContain('Maps/Launcher.SC2Map')
  expect(view.text()).toContain('D:\\Packages\\one')
  expect(view.text()).toContain('D:\\Game\\one')
  expect(view.findComponent(PackageMarkdown).exists()).toBe(false)
  expect(view.text()).not.toContain('包内文档')
})
test('orders available document tabs and selects nested related documents', async () => {
  ipc.ipcContentAssets.mockResolvedValue({
    ok: true,
    data: { readme: 'README.md', changelog: 'changes.md', docs: ['docs/a.md', 'docs/b.md'] },
  })
  const view = mount(RecordDetails, { props: { record }, global: global() })
  await flushPromises()
  expect(view.findAll('nav button').map((button) => button.text())).toEqual([
    '详情',
    '目标文件树',
    'README',
    '更新日志',
    '相关文档',
  ])
  await view.findAll('nav button')[2]!.trigger('click')
  expect(view.findComponent(PackageMarkdown).props('path')).toBe('README.md')
  await view.findAll('nav button')[4]!.trigger('click')
  expect(view.findComponent(PackageMarkdown).props('path')).toBe('docs/a.md')
  await view
    .findAll('button')
    .find((button) => button.text() === 'docs/b.md')!
    .trigger('click')
  expect(view.findComponent(PackageMarkdown).props('path')).toBe('docs/b.md')
  view.findComponent(PackageMarkdown).vm.$emit('navigate', 'docs/a.md', 'heading')
  await flushPromises()
  expect(view.findComponent(PackageMarkdown).props('fragment')).toBe('heading')
})
test('does not infer docs from manifest when main index omits unavailable files', async () => {
  const view = mount(RecordDetails, {
    props: {
      record: { ...record, package: { ...record.package, readme: 'missing.md' } } as ContentRecord,
    },
    global: global(),
  })
  await flushPromises()
  expect(view.findAll('nav button')).toHaveLength(2)
})
test.each([
  [{ readme: 'README.md', changelog: null, docs: [] }, ['详情', '目标文件树', 'README']],
  [{ readme: null, changelog: 'changes.md', docs: [] }, ['详情', '目标文件树', '更新日志']],
  [{ readme: null, changelog: null, docs: ['guide.txt'] }, ['详情', '目标文件树', '相关文档']],
])('includes only tabs provided by the readable asset index: %j', async (assets, labels) => {
  ipc.ipcContentAssets.mockResolvedValue({ ok: true, data: assets })
  const view = mount(RecordDetails, { props: { record }, global: global() })
  await flushPromises()
  expect(view.findAll('nav button').map((button) => button.text())).toEqual(labels)
})
test('discards stale asset indexes after selecting another package', async () => {
  let finish!: (result: unknown) => void
  ipc.ipcContentAssets.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const view = mount(RecordDetails, { props: { record }, global: global() })
  await view.setProps({ record: { ...record, localId: 'two' } })
  await flushPromises()
  finish({ ok: true, data: { readme: 'old.md', changelog: null, docs: [] } })
  await flushPromises()
  expect(view.findAll('nav button')).toHaveLength(2)
})
test('campaign page has no added top cover or document reader outside detail modal', async () => {
  const view = mount(CampaignDetails, {
    props: { current: record, modelValue: 'WOL', busy: false, available: true },
    global: global(),
  })
  await flushPromises()
  expect(view.findComponent({ name: 'ContentPackageImage' }).exists()).toBe(false)
  expect(view.findComponent(RecordDetails).exists()).toBe(false)
  const buttons = view.findAll('button').filter((button) => button.text() === '详情')
  await buttons[0]!.trigger('click')
  expect(view.find('aside').exists()).toBe(true)
  expect(view.findComponent(RecordDetails).exists()).toBe(true)
})
