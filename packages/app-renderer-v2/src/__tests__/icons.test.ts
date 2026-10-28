import ui from '@nuxt/ui/vue-plugin'
import Button from '@nuxt/ui/runtime/components/Button.vue'
import FileTree from '../views/campaign/components/FileTree.vue'
import { init } from 'virtual:nuxt-ui-icons'
import { addIcon, iconLoaded, Icon } from '@iconify/vue'
import { mount } from '@vue/test-utils'
import { localIconNames } from '../../scripts/local-icons'
import { expect, test, vi } from 'vitest'
import { _api } from '@iconify/vue'
import { disableIconRequests } from '../icons'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tabler from '@iconify-json/tabler/icons.json'

test('every Nuxt UI default icon is a valid locally installed Tabler icon', () => {
  const config = readFileSync(resolve(import.meta.dirname, '../../vite.config.ts'), 'utf8')
  const mapping = config.match(/export const uiIcons = \{([\s\S]*?)\} as const/)![1]!
  const names = [...mapping.matchAll(/['"](i-tabler-[^'"]+)['"]/g)].map((match) => match[1]!)
  expect(names.length).toBeGreaterThan(0)
  for (const name of names) {
    expect(name.startsWith('i-tabler-')).toBe(true)
    expect(Object.hasOwn(tabler.icons, name.slice('i-tabler-'.length))).toBe(true)
  }
})
test('remote icon fallback never calls network fetch', async () => {
  const spy = vi.spyOn(_api, 'setFetch')
  const network = vi.spyOn(globalThis, 'fetch')
  disableIconRequests()
  const handler = spy.mock.calls[0]![0]
  const result = await handler('https://api.iconify.design/tabler.json?icons=missing')
  expect(result.status).toBe(404)
  expect(network).not.toHaveBeenCalled()
  spy.mockRestore()
  network.mockRestore()
})

test('every application icon and loading default is registered in the offline runtime bundle', () => {
  const config = readFileSync(resolve(import.meta.dirname, '../../vite.config.ts'), 'utf8')
  const defaults = Object.fromEntries(
    [...config.matchAll(/(\w+): ['"](i-tabler-[^'"]+)['"]/g)].map((match) => [
      match[1]!,
      match[2]!,
    ]),
  )
  init((name, data) => {
    addIcon(name, data)
    addIcon(name.replace(':', '-'), data)
  })
  const names = localIconNames(resolve(import.meta.dirname, '../..'), defaults)
  for (const name of names) expect(iconLoaded(name.slice(2))).toBe(true)
  for (const name of [
    'tabler-map',
    'tabler-puzzle',
    'tabler-braces',
    'tabler-file-code',
    'tabler-loader-2',
  ]) {
    const wrapper = mount(Icon, { props: { icon: name, ssr: true } })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.html()).toContain('<path')
    wrapper.unmount()
  }
})

test('real Nuxt loading buttons and dynamic file tree icons render offline SVG paths', async () => {
  const network = vi.spyOn(globalThis, 'fetch')
  disableIconRequests()
  const button = mount(Button, {
    props: { loading: true },
    slots: { default: 'Loading' },
    global: { plugins: [ui] },
  })
  const tree = mount(FileTree, {
    props: {
      tree: {
        kind: 'directory',
        name: 'Maps',
        path: 'Maps',
        bytes: 0,
        modifiedAt: null,
        children: [
          {
            kind: 'directory',
            name: 'A.SC2Map',
            path: 'Maps/A.SC2Map',
            bytes: 0,
            modifiedAt: null,
            children: [],
          },
          { kind: 'file', name: 'package.json', path: 'package.json', bytes: 1, modifiedAt: null },
        ],
      },
    },
    global: { plugins: [ui] },
  })
  try {
    expect(button.find('svg.animate-spin').exists()).toBe(true)
    expect(button.find('svg path').exists()).toBe(true)
    expect(tree.findAll('svg')).toHaveLength(5)
    expect(tree.findAll('svg path').length).toBeGreaterThanOrEqual(5)
    expect(network).not.toHaveBeenCalled()
  } finally {
    button.unmount()
    tree.unmount()
    network.mockRestore()
  }
})
