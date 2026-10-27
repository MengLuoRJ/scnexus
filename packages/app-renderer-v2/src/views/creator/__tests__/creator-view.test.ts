import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../CreatorView.vue'
import zh from '../../../locales/zh.json'
import workshop from '../../../locales/workshop.zh.json'
const mocks = vi.hoisted(() => ({
  mine: vi.fn<() => Promise<unknown>>(),
  create: vi.fn<(auth: unknown, input: unknown) => Promise<unknown>>(),
  select: vi.fn<() => Promise<unknown>>(),
}))
const gate = reactive({ active: true, enabled: true })
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({ signedIn: true, snapshot: { epoch: 1 }, httpAuth: {} }),
}))
vi.mock('../../../stores/creator', () => ({ useCreatorStore: () => gate }))
vi.mock('../../../stores/content-center', () => ({ useContentCenterStore: () => gate }))
vi.mock('../../../stores/workshop', () => ({
  useWorkshopStore: () => ({ tasks: [], connect: () => () => {}, accept: () => {} }),
  unwrapWorkshop: (value: { data: unknown }) => value.data,
}))
vi.mock('../../../apis/workshop', () => ({
  apiWorkshopMine: mocks.mine,
  apiWorkshopCreate: mocks.create,
  apiWorkshopUpdate: async () => {},
  apiWorkshopVersions: async () => [],
  apiWorkshopCreateVersion: async () => {},
  apiWorkshopCancelCandidate: async () => {},
  socialKeys: ['discord'],
  sponsorKeys: ['afdian'],
  isStrictSemver: () => true,
}))
vi.mock('../../../ipcs/workshop', () => ({
  ipcWorkshopSelectPackage: mocks.select,
  ipcWorkshopSelectImage: async () => null,
  ipcWorkshopUpload: async () => {},
}))
vi.mock('../../../components/workshop/WorkshopEditor.vue', () => ({
  default: { template: '<div>Rich text editor</div>' },
}))
vi.mock('../../../components/workshop/WorkshopRichText.vue', () => ({
  default: { template: '<div />' },
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: () => {} }) }))
const button = defineComponent({
  props: ['disabled', 'type'],
  emits: ['click'],
  template:
    '<button :disabled="disabled" :type="type || \'button\'" @click="$emit(\'click\')"><slot /></button>',
})
const input = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})
const form = defineComponent({
  emits: ['submit'],
  template: '<form @submit.prevent="$emit(\'submit\')"><slot /></form>',
})
const pass = defineComponent({ template: '<div><slot /><slot name="actions" /></div>' })
const wrappers: { unmount(): void }[] = []
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.resetAllMocks()
  gate.active = true
  gate.enabled = true
})
function render() {
  const wrapper = mount(View, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'zh',
          flatJson: true,
          messages: { zh: { ...zh, ...workshop } },
        }) as unknown as Plugin,
      ],
      stubs: {
        Button: button,
        Input: input,
        Textarea: input,
        Form: form,
        FormField: pass,
        Card: pass,
        Alert: pass,
        Progress: true,
        Modal: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
test('manifest name prefills project title only after explicit action and creation sends no scnid', async () => {
  mocks.mine.mockResolvedValue([])
  mocks.create.mockResolvedValue({ scnid: 10, contentRevision: 1 })
  mocks.select.mockResolvedValue({
    data: {
      selectionId: 'selection',
      manifest: {
        name: 'Manifest title',
        description: 'Manifest description',
        version: '1.2.3',
        author: 'Author',
        type: 'customize',
        website: 'https://example.com',
      },
    },
  })
  const wrapper = render()
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '创建作品')!
    .trigger('click')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '选择并验证压缩包')!
    .trigger('click')
  await flushPromises()
  expect((wrapper.findAll('input')[0]!.element as HTMLInputElement).value).toBe('')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '从清单预填')!
    .trigger('click')
  expect((wrapper.findAll('input')[0]!.element as HTMLInputElement).value).toBe('Manifest title')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(mocks.create).toHaveBeenCalledWith(
    {},
    expect.objectContaining({ title: 'Manifest title', description: 'Manifest description' }),
  )
  expect(mocks.create.mock.calls[0]![1]).not.toHaveProperty('scnid')
})
test('inactive creators never load owner projects', async () => {
  gate.active = false
  render()
  await flushPromises()
  expect(mocks.mine).not.toHaveBeenCalled()
})
