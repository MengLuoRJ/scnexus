import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import View from '../DownloadWizard.vue'
import { useWorkshopStore } from '../../../stores/workshop'
import { useAuthStore } from '../../../stores/auth'
import { useContentCenterStore } from '../../../stores/content-center'
import zh from '../../../locales/zh'
const mocks = vi.hoisted(() => ({
  preview: vi.fn<() => Promise<unknown>>(),
  confirm: vi.fn<() => Promise<unknown>>(),
  download: vi.fn<() => Promise<unknown>>(),
  detail: vi.fn<() => Promise<unknown>>(),
  push: vi.fn<() => Promise<void>>(),
  toast: vi.fn<(value: unknown) => void>(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('../../../apis/workshop', () => ({ apiWorkshopDetail: mocks.detail }))
vi.mock('../../../ipcs/workshop', () => ({
  ipcWorkshopPreviewGithub: mocks.preview,
  ipcWorkshopConfirmGithub: mocks.confirm,
  ipcWorkshopDownload: mocks.download,
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
const wrappers: { unmount(): void }[] = []
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.clearAllMocks()
})
function render(scnid?: number) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkshopStore()
  store.openDownload(scnid)
  const wrapper = mount(View, {
    global: {
      plugins: [
        pinia,
        createI18n({
          legacy: false,
          flatJson: true,
          locale: 'zh',
          messages: { zh },
        }),
      ],
      stubs: {
        Modal: defineComponent({
          props: ['open'],
          template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>',
        }),
        Button: defineComponent({
          props: ['disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        }),
        Form: defineComponent({
          emits: ['submit'],
          template: '<form @submit.prevent="$emit(\'submit\')"><slot /></form>',
        }),
        FormField: defineComponent({ template: '<div><slot /></div>' }),
        Input: defineComponent({
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        }),
        Select: defineComponent({
          props: ['modelValue', 'items'],
          emits: ['update:modelValue'],
          template:
            '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
        }),
        Alert: true,
      },
    },
  })
  wrappers.push(wrapper)
  return { wrapper, store }
}
test('GitHub source is editable, validated and previewed without downloading until confirmation', async () => {
  const { wrapper, store } = render()
  expect(wrapper.findAll('input')[1]!.element.value).toBe('main')
  await wrapper.findAll('input')[0]!.setValue('https://github.com.evil.test/owner/repo')
  await wrapper.get('form').trigger('submit')
  expect(mocks.preview).not.toHaveBeenCalled()
  await wrapper.findAll('input')[0]!.setValue('https://github.com/owner/repo')
  await wrapper.findAll('input')[1]!.setValue('feature/package')
  mocks.preview.mockResolvedValue({
    ok: true,
    data: {
      previewId: 'preview',
      source: {
        kind: 'github',
        repository: 'https://github.com/owner/repo',
        revision: 'fixed-commit',
      },
      manifest: {
        name: 'Example',
        version: '1.0.0',
        description: 'Summary',
        scripts: { private: 'not displayed' },
      },
    },
  })
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.preview).toHaveBeenCalledWith({
    kind: 'github',
    repository: 'https://github.com/owner/repo',
    revision: 'feature/package',
  })
  expect(wrapper.text()).toContain('Example')
  expect(wrapper.text()).toContain('fixed-commit')
  expect(wrapper.text()).not.toContain('not displayed')
  expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.confirm).not.toHaveBeenCalled()
  mocks.confirm.mockResolvedValue({
    ok: true,
    data: { taskId: 'new', kind: 'download', name: 'Example', status: 'running' },
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '确认下载')!
    .trigger('click')
  await flushPromises()
  expect(mocks.confirm).toHaveBeenCalledWith('preview')
  expect(store.wizardOpen).toBe(false)
})
test('switching source updates fields and anonymous workshop login preserves intent without requesting a preview', async () => {
  const { wrapper, store } = render()
  await wrapper.get('select').setValue('workshop')
  expect(wrapper.findAll('input')).toHaveLength(1)
  await wrapper.get('input').setValue('42')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.push).toHaveBeenCalledWith({
    path: '/account',
    query: { redirect: '/downloads?download=resume' },
  })
  expect(store.draft.scnid).toBe('42')
  expect(mocks.detail).not.toHaveBeenCalled()
  expect(mocks.download).not.toHaveBeenCalled()
})
test('workshop preview shows basic detail but not rich text, and cancel does not start a transfer', async () => {
  const { wrapper, store } = render(42)
  const auth = useAuthStore()
  auth.snapshot = { ...auth.snapshot, status: 'signed-in' }
  mocks.detail.mockResolvedValue({
    scnid: 42,
    title: 'Project title',
    description: 'Short description',
    approvedVersionId: 'version',
    detail: 'Rich text omitted',
  })
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('Project title')
  expect(wrapper.text()).toContain('Short description')
  expect(wrapper.text()).not.toContain('Rich text omitted')
  expect(mocks.download).not.toHaveBeenCalled()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '取消')!
    .trigger('click')
  expect(store.wizardOpen).toBe(false)
  expect(mocks.download).not.toHaveBeenCalled()
})
test('disabled workshop never automatically enables or fetches project information', async () => {
  const { wrapper } = render(42)
  const center = useContentCenterStore()
  center.enabled = false
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(center.enabled).toBe(false)
  expect(mocks.detail).not.toHaveBeenCalled()
  expect(mocks.download).not.toHaveBeenCalled()
})

test.each([
  ['campaign', '战役'],
  ['customize', '自制'],
  ['dependency', '依赖'],
])(
  'manifest labels and %s type are localized; optional campaign is included',
  async (type, label) => {
    const { wrapper, store } = render()
    store.preview = {
      previewId: 'preview',
      source: { kind: 'github', repository: 'https://github.com/owner/repo', revision: 'commit' },
      manifest: {
        name: 'Example',
        description: 'Summary',
        author: 'Author',
        version: '1.0.0',
        type,
        campaign: 'WOL',
      },
      epoch: 0,
      access: 0,
    }
    await flushPromises()
    expect(wrapper.findAll('dt').map((field) => field.text())).toEqual([
      '名称',
      '作品简介',
      '作者',
      '版本',
      '类型',
      '战役',
    ])
    expect(wrapper.findAll('dd').map((field) => field.text())).toEqual([
      'Example',
      'Summary',
      'Author',
      '1.0.0',
      label,
      'WOL',
    ])
  },
)
