import { afterEach, expect, test } from 'vitest'
import { defineComponent } from 'vue'
import type { Plugin } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Conflict, ConflictDecision } from '@scnexus/app-shared/types/content.type'
import ConflictChoices from '../components/ConflictChoices.vue'
import FileTree from '../components/FileTree.vue'
import zh from '../../../locales/zh'

const files: Conflict[] = ['first', 'second'].map((name, index) => ({
  conflictId: name,
  type: 'mod',
  incoming: { name, path: `Mods/${name}`, bytes: index ? 1250000 : 1234, modifiedAt: null },
  local: {
    name,
    path: `D:\\Game\\Mods\\${name}`,
    bytes: index ? 1000000000 : 999,
    modifiedAt: null,
  },
}))
const button = defineComponent({
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
})
const wrappers: { unmount: () => void }[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})
function render(selected: ConflictDecision[] = []) {
  const wrapper = mount(ConflictChoices, {
    props: {
      files,
      modelValue: selected,
      'onUpdate:modelValue': (value: ConflictDecision[]) => {
        void wrapper.setProps({ modelValue: value })
      },
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh', messages: { zh } }) as unknown as Plugin],
      stubs: { Button: button },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

test('batch choices set every current conflict and individual choices preserve the rest', async () => {
  const wrapper = render(
    files.map((file) => ({ conflictId: file.conflictId, action: 'overwrite' })),
  )
  const batch = wrapper.findAll('[role="group"]')[0]!
  expect(batch.findAll('button').map((item) => item.attributes('aria-pressed'))).toEqual([
    'true',
    'false',
  ])
  await batch.findAll('button')[1]!.trigger('click')
  expect(wrapper.props('modelValue')).toEqual(
    files.map((file) => ({ conflictId: file.conflictId, action: 'keep' })),
  )
  const first = wrapper.findAll('[role="group"]')[1]!
  await first.findAll('button')[0]!.trigger('click')
  expect(wrapper.props('modelValue')).toEqual([
    { conflictId: 'second', action: 'keep' },
    { conflictId: 'first', action: 'overwrite' },
  ])
  expect(batch.findAll('button').map((item) => item.attributes('aria-pressed'))).toEqual([
    'false',
    'false',
  ])
  expect(first.findAll('button').map((item) => item.attributes('aria-pressed'))).toEqual([
    'true',
    'false',
  ])
  await batch.findAll('button')[0]!.trigger('click')
  expect(wrapper.props('modelValue')).toEqual(
    files.map((file) => ({ conflictId: file.conflictId, action: 'overwrite' })),
  )
})

test('single conflict has only individual toggles and no implicit activation decision', async () => {
  const wrapper = render()
  await wrapper.setProps({ files: [files[0]!] })
  expect(wrapper.findAll('[role="group"]')).toHaveLength(1)
  expect(wrapper.findAll('button').map((item) => item.attributes('aria-pressed'))).toEqual([
    'false',
    'false',
  ])
  expect(wrapper.find('select').exists()).toBe(false)
  await wrapper.findAll('button')[1]!.trigger('click')
  expect(wrapper.props('modelValue')).toEqual([{ conflictId: 'first', action: 'keep' }])
})

test('conflict size comparisons use B, kB, MB and GB as appropriate', () => {
  const wrapper = render()
  for (const size of ['999 B', '1.23 kB', '1.25 MB', '1 GB']) expect(wrapper.text()).toContain(size)
})

test('file tree formats each file size', () => {
  const wrapper = mount(FileTree, {
    props: {
      tree: {
        kind: 'directory',
        name: 'root',
        path: '',
        bytes: 0,
        modifiedAt: null,
        children: files.map((file) => ({ ...file.incoming, kind: 'file' as const })),
      },
    },
  })
  wrappers.push(wrapper)
  expect(wrapper.text()).toContain('1.23 kB')
  expect(wrapper.text()).toContain('1.25 MB')
})
