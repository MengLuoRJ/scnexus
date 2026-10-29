import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import {
  packageImageData,
  renderPackageMarkdown,
  resolvePackageLink,
} from '../content/packageMarkdown'
import PackageImage from '../content/PackageImage.vue'
import PackageDocuments from '../content/PackageDocuments.vue'
import CampaignOverview from '../../views/campaign/components/CampaignOverview.vue'
import type { ContentRecord, ActiveCampaign } from '@scnexus/app-shared/types/content.type'
const ipc = vi.hoisted(() => ({
  ipcContentAssets: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  ipcContentAsset: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('../../ipcs/content', () => ipc)
const i18n = () =>
  createI18n({
    legacy: false,
    locale: 'en',
    messages: { en: {} },
    missingWarn: false,
    fallbackWarn: false,
  })
const global = () => ({
  plugins: [i18n()],
  stubs: {
    UCard: { template: '<div><slot /></div>' },
    UBadge: { template: '<span><slot /></span>' },
    UButton: { template: '<button><slot /></button>' },
    USelect: true,
    UAlert: true,
  },
})
beforeEach(() => {
  vi.resetAllMocks()
  ipc.ipcContentAssets.mockResolvedValue({
    ok: true,
    data: { image: null, readme: null, changelog: null, docs: [] },
  })
})
describe('package Markdown boundaries', () => {
  it.each([
    'https://evil.test/a.md',
    'http://evil.test/x',
    '//evil.test/a',
    'file:///secret',
    'javascript:alert(1)',
    'data:image/png;base64,AA==',
    'C:\\secret',
    '..\\secret',
    '../../secret',
    '%2e%2e/%2e%2e/secret',
    '%252e%252e/a',
    'x%00.png',
    '%2f%2fevil.test/a',
  ])('rejects %s', (value) => {
    expect(resolvePackageLink('docs/readme.md', value)).toBeNull()
  })
  it('resolves local parent, root, encoded spaces and fragments', () => {
    expect(resolvePackageLink('docs/a.md', '../images/a.png')).toEqual({
      path: 'images/a.png',
      fragment: '',
    })
    expect(resolvePackageLink('docs/a.md', '/README.md#hello')).toEqual({
      path: 'README.md',
      fragment: 'hello',
    })
    expect(resolvePackageLink('docs/a.md', 'next%20page.txt')).toEqual({
      path: 'docs/next page.txt',
      fragment: '',
    })
    expect(resolvePackageLink('docs/a.md', '#hello')).toEqual({
      path: 'docs/a.md',
      fragment: 'hello',
    })
  })
  it('prefetches only package images, disables unsafe links and escapes HTML', async () => {
    const load = vi
      .fn<
        (path: string) => Promise<import('@scnexus/app-shared/types/content.type').ContentAsset>
      >()
      .mockResolvedValue({ path: 'images/a.png', mime: 'image/png', data: 'AA==' })
    const result = await renderPackageMarkdown(
      '# Hello\n<script>alert(1)</script>\n![safe](../images/a.png) ![bad](https://evil.test/a.png)\n[next](next.md#hello) [remote](https://evil.test) [file](file:///secret)',
      'docs/readme.md',
      load,
    )
    expect(load).toHaveBeenCalledExactlyOnceWith('images/a.png')
    const ast = JSON.stringify(result.document.nodes)
    expect(ast).toContain('data:image/png;base64,AA==')
    expect(ast).not.toContain('"src":"https:')
    expect(ast).not.toContain('["script"')
    expect(ast).not.toContain('"href":"https:')
    expect(ast).toContain('"data-package-path":"docs/next.md"')
    expect(ast).toContain('"id":"hello"')
  })
  it('blocks SVG and missing images', () => {
    expect(packageImageData({ path: 'x.svg', mime: 'image/svg+xml', data: 'AA==' })).toBeNull()
    expect(packageImageData(null)).toBeNull()
  })
})
describe('package media UI', () => {
  it('uses official artwork / placeholder when optional cover is absent', async () => {
    const artwork = mount(PackageImage, {
      props: { localId: 'a', fallback: 'official.png' },
      global: global(),
    })
    const placeholder = mount(PackageImage, { props: { localId: 'a' }, global: global() })
    await flushPromises()
    expect(artwork.get('img').attributes('src')).toBe('official.png')
    expect(placeholder.find('img').exists()).toBe(false)
    expect(placeholder.text()).toContain('contentMedia.noImage')
  })
  it('requests campaign artwork only for active packages', async () => {
    const record = {
      localId: 'active',
      package: { campaign: 'WOL', name: 'Active' },
    } as ContentRecord
    mount(CampaignOverview, {
      props: {
        records: [record, { ...record, localId: 'inactive' }],
        active: { WOL: { localId: 'active' } as ActiveCampaign },
        busy: false,
      },
      global: global(),
    })
    await flushPromises()
    expect(ipc.ipcContentAssets).toHaveBeenCalledExactlyOnceWith('active')
  })
  it('replaces only the active campaign banner and restores the official banner on deactivation', async () => {
    ipc.ipcContentAssets.mockResolvedValue({ ok: true, data: { image: 'banner.png' } })
    ipc.ipcContentAsset.mockResolvedValue({
      ok: true,
      data: { path: 'banner.png', mime: 'image/png', data: 'AA==' },
    })
    const record = {
      localId: 'active',
      package: { campaign: 'WOL', name: 'Active' },
    } as ContentRecord
    const view = mount(CampaignOverview, {
      props: {
        records: [record],
        active: { WOL: { localId: 'active' } as ActiveCampaign },
        busy: false,
      },
      global: global(),
    })
    await flushPromises()
    expect(
      view.findAll('img').filter((image) => image.attributes('src')?.startsWith('data:')),
    ).toHaveLength(1)
    await view.setProps({ active: {} })
    await flushPromises()
    expect(view.findAll('img').some((image) => image.attributes('src')?.startsWith('data:'))).toBe(
      false,
    )
    expect(view.findAll('img')).toHaveLength(4)
  })
  it('discards image response after switching package', async () => {
    ipc.ipcContentAssets.mockResolvedValue({ ok: true, data: { image: 'cover.png' } })
    let finish!: (result: unknown) => void
    ipc.ipcContentAsset.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const view = mount(PackageImage, { props: { localId: 'old' }, global: global() })
    await flushPromises()
    ipc.ipcContentAssets.mockResolvedValue({ ok: true, data: { image: null } })
    await view.setProps({ localId: 'new' })
    finish({ ok: true, data: { path: 'cover.png', mime: 'image/png', data: 'AA==' } })
    await flushPromises()
    expect(view.find('img').exists()).toBe(false)
  })
  it('delegates the selected document to the shared Markdown reader', () => {
    const view = mount(PackageDocuments, {
      props: { localId: 'package-a', path: 'README.md', documents: ['README.md', 'docs/guide.md'] },
      global: {
        ...global(),
        stubs: {
          ...global().stubs,
          PackageMarkdown: {
            props: ['localId', 'path'],
            template: '<article>{{ path }}</article>',
          },
        },
      },
    })
    expect(view.find('article').text()).toBe('README.md')
    expect(view.findAll('button').map((button) => button.text())).toEqual([
      'README.md',
      'docs/guide.md',
    ])
  })
})
