import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent } from 'vue'
import PackageMarkdown from '../content/PackageMarkdown.vue'

const asset = vi.hoisted(() => vi.fn<(id: string, path: string) => Promise<unknown>>())
vi.mock('../../ipcs/content', () => ({ ipcContentAsset: asset }))
const mountReader = (source: string) => {
  asset.mockImplementation(async (_id, path) => ({
    ok: true,
    data: {
      path,
      mime: path.endsWith('.png') ? 'image/png' : 'text/markdown',
      data: path.endsWith('.png') ? 'AA==' : source,
    },
  }))
  return mount(PackageMarkdown, {
    props: { localId: 'package-a', path: 'docs/README.md' },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en',
          messages: { en: {} },
          missingWarn: false,
          fallbackWarn: false,
        }),
      ],
      stubs: { UAlert: true, UButton: { template: '<button><slot /></button>' } },
      components: {
        Dangerous: defineComponent({
          setup() {
            throw new Error('MDC mounted')
          },
        }),
      },
    },
  })
}
beforeEach(() => vi.resetAllMocks())

describe('local Comark reader', () => {
  it('renders real Comark with Nuxt UI prose, code, tables, lists and package images', async () => {
    const view = mountReader(
      '# Hello\n\n**Bold** and *emphasis*\n\n- Item\n\n| A | B |\n|---|---|\n| X | Y |\n\n```js\nconst value = 1\n```\n\n![local](../images/a.png)',
    )
    await flushPromises()
    expect(view.get('h1').text()).toBe('Hello')
    expect(view.get('h1').classes().length).toBeGreaterThan(0)
    expect(view.get('strong').text()).toBe('Bold')
    expect(view.get('li').text()).toBe('Item')
    expect(view.get('td').text()).toBe('X')
    expect(view.get('pre').text()).toContain('const value = 1')
    expect(view.get('img').attributes('src')).toBe('data:image/png;base64,AA==')
    expect(asset).toHaveBeenCalledWith('package-a', 'images/a.png')
  })

  it('never instantiates HTML/MDC components, attributes, events, bindings or remote resources', async () => {
    const view = mountReader(
      '<script>evil()</script>\n<iframe src="https://evil.test"></iframe>\n<img src="https://evil.test/raw.png" onerror="evil()">\n\n::dangerous\nunsafe\n::\n\n[local](next.md){as="Dangerous" @click="evil()" :href="data.secret"}\n\n![remote](https://evil.test/a.png) ![file](file:///secret) ![escape](../../secret.png) ![svg](data:image/svg+xml,evil)\n\n[remote](https://evil.test) [protocol](javascript:evil()) [file](file:///secret) [escape](../../secret.md)',
    )
    await flushPromises()
    expect(view.find('script, iframe, img, dangerous').exists()).toBe(false)
    expect(view.find('[onerror], [onclick], [href^="https:"], [src^="https:"]').exists()).toBe(
      false,
    )
    expect(view.text()).toContain('<script>evil()</script>')
    expect(asset).toHaveBeenCalledExactlyOnceWith('package-a', 'docs/README.md')
    expect(view.findAll('a[aria-disabled]')).not.toHaveLength(0)
    await view.get('a[aria-disabled]').trigger('click')
    expect(view.emitted('navigate')).toBeUndefined()
    await view.get('a[data-package-path]').trigger('click')
    expect(view.emitted('navigate')).toEqual([['docs/next.md', '']])
  })

  it('emits same-package document and fragment navigation without native navigation', async () => {
    const view = mountReader('# Here\n\n[next](../next.txt#hello) [here](#here)')
    await flushPromises()
    await view.get('a[data-package-path="next.txt"]').trigger('click')
    expect(view.emitted('navigate')?.[0]).toEqual(['next.txt', 'hello'])
    await view.get('a[data-package-path="docs/README.md"]').trigger('click')
    expect(view.emitted('navigate')?.[1]).toEqual(['docs/README.md', 'here'])
  })

  it('discards pending document response when the package changes', async () => {
    const view = mountReader('Current')
    await flushPromises()
    let finish!: (value: unknown) => void
    asset.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await view.setProps({ localId: 'old' })
    await view.setProps({ localId: 'new' })
    await flushPromises()
    finish({ ok: true, data: { mime: 'text/markdown', data: '# Stale' } })
    await flushPromises()
    expect(view.text()).not.toContain('Stale')
    expect(view.text()).toContain('Current')
  })
})
