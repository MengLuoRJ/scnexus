import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import FileTree from '../components/FileTree.vue'
import { fileTreeIcon } from '../components/fileTreeIcon'
import type { FileTree as Tree } from '@scnexus/app-shared/types/content.type'
const node = (name: string, kind: Tree['kind'] = 'file', children: Tree[] = []): Tree => ({
  name,
  path: name,
  kind,
  children,
  bytes: 1,
  modifiedAt: null,
})
test('normal directories expand but map/mod component folders stay collapsed until opened', async () => {
  const tree = node('Maps', 'directory', [
    node('Campaign', 'directory', [
      node('A.SC2Map', 'directory', [node('MapInfo')]),
      node('B.sc2mod', 'directory', [node('ModInfo')]),
      node('package.json'),
    ]),
  ])
  const wrapper = mount(FileTree, { props: { tree }, global: { stubs: { UIcon: true } } })
  try {
    const details = wrapper.findAll('details')
    expect(details.map((item) => item.attributes('open') !== undefined)).toEqual([
      true,
      true,
      false,
      false,
    ])
    expect(wrapper.text()).not.toContain('MapInfo')
    ;(details[2]!.element as HTMLDetailsElement).open = true
    await details[2]!.trigger('toggle')
    expect(wrapper.text()).toContain('MapInfo')
    expect(wrapper.text()).not.toContain('ModInfo')
  } finally {
    wrapper.unmount()
  }
})
test('replacing a tree resets its default expansion', async () => {
  const wrapper = mount(FileTree, {
    props: { tree: node('root', 'directory') },
    global: { stubs: { UIcon: true } },
  })
  await wrapper.setProps({ tree: node('New.SC2Map', 'directory', [node('Hidden')]) })
  expect(wrapper.find('details').attributes('open')).toBeUndefined()
  expect(wrapper.text()).not.toContain('Hidden')
  wrapper.unmount()
})
test.each([
  ['A.SC2Map', 'i-tabler-map'],
  ['A.SC2Mod', 'i-tabler-puzzle'],
  ['package.json', 'i-tabler-braces'],
  ['script.galaxy', 'i-tabler-file-code'],
  ['icon.dds', 'i-tabler-photo'],
  ['sound.ogg', 'i-tabler-music'],
  ['archive.zip', 'i-tabler-file-zip'],
  ['metadata.txt', 'i-tabler-file-text'],
  ['unknown', 'i-tabler-file'],
])('file %s has a recognizable icon', (name, icon) => {
  expect(fileTreeIcon(node(name), false).icon).toBe(icon)
})

test.each([
  ['Map.SC2Map', 'file', 'icon_ext_SC2Map_128.png'],
  ['Mod.sc2mod', 'file', 'icon_ext_SC2Mod_128.png'],
  ['Map.sc2map', 'directory', 'icon_ext_SC2Map_128.png'],
  ['Mod.SC2Mod', 'directory', 'icon_ext_SC2Mod_128.png'],
] as const)('%s (%s) renders its bundled resource image', (name, kind, image) => {
  const wrapper = mount(FileTree, {
    props: { tree: node(name, kind) },
    global: { stubs: { UIcon: true } },
  })
  try {
    const icon = wrapper.get('img')
    expect(icon.attributes('src')).toContain(image)
    expect(icon.attributes('alt')).toBe('')
    expect(icon.attributes('draggable')).toBe('false')
  } finally {
    wrapper.unmount()
  }
})
