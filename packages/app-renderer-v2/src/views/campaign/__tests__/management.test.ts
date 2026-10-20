import { afterEach, expect, test } from 'vitest'
import { defineComponent } from 'vue'
import type { Plugin } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { ActiveCampaign, ContentRecord } from '@scnexus/app-shared/types/content.type'
import CampaignManagement from '../components/CampaignManagement.vue'
import zh from '../../../locales/zh.json'

const records = [
  {
    localId: 'one',
    package: {
      name: 'First',
      campaign: 'WOL',
      author: 'Author',
      version: '1',
      description: 'Description',
    },
    mode: 'scnexus',
    fileCount: 3,
    bytes: 1024,
    payloadDirectory: 'D:\\Game\\First',
    targetTree: { children: [] },
  },
  {
    localId: 'two',
    package: {
      name: 'Second',
      campaign: 'HOTS',
      author: 'Author',
      version: '2',
      description: 'Other',
    },
    mode: 'ccm',
    fileCount: 2,
    bytes: 2048,
    payloadDirectory: 'D:\\Game\\Second',
    targetTree: { children: [] },
  },
  {
    localId: 'external',
    package: { name: 'External', campaign: 'WOL', author: '', version: '', description: '' },
    mode: 'ccm',
    external: true,
    fileCount: 1,
    bytes: 1024,
    payloadDirectory: null,
    targetTree: { children: [] },
  },
] as unknown as ContentRecord[]
const passThrough = defineComponent({ template: '<div><slot /></div>' })
const button = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})
const tabs = defineComponent({
  props: ['items', 'modelValue'],
  emits: ['update:modelValue'],
  template:
    '<div><button v-for="item in items" :key="item.value" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></div>',
})
const wrappers: { unmount: () => void }[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})
function render() {
  const wrapper = mount(CampaignManagement, {
    props: { records, active: { WOL: { localId: 'one' } as ActiveCampaign }, busy: false },
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
        Card: passThrough,
        Badge: passThrough,
        Button: button,
        Tabs: tabs,
        Progress: true,
        Alert: defineComponent({ props: ['title'], template: '<p>{{ title }}</p>' }),
        Modal: defineComponent({
          props: ['open', 'title'],
          template: '<div v-if="open"><h2>{{ title }}</h2><slot name="body" /></div>',
        }),
        FileTree: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

test('statistics aggregate all records by campaign and format, and react to removal', async () => {
  const wrapper = render()
  expect(wrapper.text()).toContain('战役包总数3')
  expect(wrapper.text()).toContain('文件总数6')
  expect(wrapper.text()).toContain('内容总大小4.1 kB')
  expect(wrapper.text()).toContain('SCNexus: 1 · 1.02 kB')
  expect(wrapper.text()).toContain('CCM: 1 · 2.05 kB')
  expect(wrapper.text()).toContain('不代表实际磁盘占用')
  await wrapper.setProps({ records: records.slice(0, 1) })
  expect(wrapper.text()).toContain('战役包总数1')
  expect(wrapper.text()).toContain('文件总数3')
  expect(wrapper.text()).toContain('内容总大小1.02 kB')
  expect(wrapper.findAll('h3').map((node) => node.text())).toEqual(['First'])
})

test('category filtering leaves global totals unchanged and supports empty categories', async () => {
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((node) => node.text() === '虫群之心')!
    .trigger('click')
  expect(wrapper.findAll('h3').map((node) => node.text())).toEqual(['Second'])
  expect(wrapper.text()).toContain('战役包总数3')
  await wrapper
    .findAll('button')
    .find((node) => node.text() === '虚空之遗')!
    .trigger('click')
  expect(wrapper.findAll('h3')).toHaveLength(0)
  expect(wrapper.text()).toContain('此分类暂无战役包')
})

test('management emits operations and folder requests, disables busy and external activation', async () => {
  const wrapper = render()
  const action = (text: string) => wrapper.findAll('button').filter((node) => node.text() === text)
  await action('取消激活')[0]!.trigger('click')
  await action('激活')[0]!.trigger('click')
  await action('卸载')[0]!.trigger('click')
  await action('打开所在目录')[0]!.trigger('click')
  expect(wrapper.emitted('operate')).toEqual([
    [records[0], 'deactivate'],
    [records[1], 'activate'],
    [records[0], 'uninstall'],
  ])
  expect(wrapper.emitted('folder')?.[0]).toEqual([records[0]])
  expect(action('切换')[0]!.attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('外部记录')
  await wrapper.setProps({ busy: true })
  for (const text of ['取消激活', '激活', '卸载', '打开所在目录']) {
    expect(action(text).every((node) => node.attributes('disabled') !== undefined)).toBe(true)
  }
  await action('卸载')[0]!.trigger('click')
  expect(wrapper.emitted('operate')).toHaveLength(3)
})

test('details show the selected package and close when its record disappears', async () => {
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((node) => node.text() === '详情')!
    .trigger('click')
  expect(wrapper.find('h2').exists()).toBe(true)
  expect(wrapper.findAll('h2').some((node) => node.text() === 'First')).toBe(true)
  await wrapper.setProps({ records: [] })
  expect(wrapper.findAll('h2').some((node) => node.text() === 'First')).toBe(false)
  expect(wrapper.text()).toContain('战役包总数0')
  expect(wrapper.text()).toContain('内容总大小0 B')
})
