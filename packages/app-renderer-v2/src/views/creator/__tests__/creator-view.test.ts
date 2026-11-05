import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../CreatorView.vue'
import zh from '../../../locales/zh'
const mocks = vi.hoisted(() => ({
  mine: vi.fn<() => Promise<unknown>>(),
  create: vi.fn<(auth: unknown, input: unknown) => Promise<unknown>>(),
  update: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  select: vi.fn<() => Promise<unknown>>(),
  quota: vi.fn<() => Promise<unknown>>(),
  version: vi.fn<() => Promise<unknown>>(),
  upload: vi.fn<() => Promise<unknown>>(),
  toast: vi.fn<(value: unknown) => void>(),
}))
const gate = reactive({
  active: true,
  enabled: true,
  loadQuota: mocks.quota,
  quota: { maxProjects: 9, maxPackageBytes: 0, maxStorageBytes: 0, usedStorageBytes: 5000000000 },
  quotaError: null as unknown,
})
const auth = reactive({
  signedIn: true,
  snapshot: { epoch: 1, sessionId: 'session' },
  httpAuth: {},
})
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => auth,
}))
vi.mock('../../../stores/creator', () => ({ useCreatorStore: () => gate }))
vi.mock('../../../stores/content-center', () => ({ useContentCenterStore: () => gate }))
vi.mock('../../../stores/workshop', () => ({
  useWorkshopStore: () => ({ tasks: [], connect: () => () => {}, accept: () => {} }),
  unwrapWorkshop: (value: { data: unknown }) => value.data,
}))
vi.mock('../../../apis/workshop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../apis/workshop')>()),
  apiWorkshopMine: mocks.mine,
  apiWorkshopCreate: mocks.create,
  apiWorkshopUpdate: mocks.update,
  apiWorkshopVersions: async () => [],
  apiWorkshopCreateVersion: mocks.version,
  apiWorkshopCancelCandidate: async () => {},
  socialKeys: ['discord'],
  sponsorKeys: ['afdian'],
  isStrictSemver: () => true,
}))
vi.mock('../../../ipcs/workshop', () => ({
  ipcWorkshopSelectPackage: mocks.select,
  ipcWorkshopSelectImage: async () => null,
  ipcWorkshopUpload: mocks.upload,
}))
vi.mock('../../../components/workshop/WorkshopEditor.vue', () => ({
  default: { template: '<div>Rich text editor</div>' },
}))
vi.mock('../../../components/workshop/WorkshopRichText.vue', () => ({
  default: { template: '<div />' },
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
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
  gate.quotaError = null
})
function render() {
  mocks.quota.mockResolvedValue({ userId: 'user', maxProjects: 9, maxPackageBytes: 700000000 })
  const wrapper = mount(View, {
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
      size: 600000000,
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
    .find((button) => button.text() === '从安装包填写资料')!
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

async function click(wrapper: ReturnType<typeof render>, label: string) {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === label)!
    .trigger('click')
  await flushPromises()
}
test('checks fresh project quota before create and permits more than five projects', async () => {
  mocks.mine.mockResolvedValue(
    Array.from({ length: 6 }, (_, i) => ({ scnid: i + 1, title: 'Project' })),
  )
  const wrapper = render()
  await flushPromises()
  await click(wrapper, '创建作品')
  await wrapper.findAll('input')[0]!.setValue('New project')
  mocks.quota.mockResolvedValueOnce({ userId: 'user', maxProjects: 6, maxPackageBytes: 700000000 })
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: expect.stringContaining('6') }),
  )
})
test('create conflict refreshes quota and never automatically resubmits', async () => {
  const { AccountError } = await import('../../../apis/internal/client')
  mocks.mine.mockResolvedValue([])
  mocks.create.mockRejectedValue(new AccountError('conflict'))
  const wrapper = render()
  await flushPromises()
  await click(wrapper, '创建作品')
  await wrapper.findAll('input')[0]!.setValue('New project')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(mocks.quota).toHaveBeenCalledTimes(3)
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: expect.stringContaining('手动重试') }),
  )
})
test('failed quota blocks package selection and create instead of using defaults', async () => {
  mocks.mine.mockResolvedValue([])
  const wrapper = render()
  await flushPromises()
  await click(wrapper, '创建作品')
  mocks.quota.mockRejectedValue(new Error('offline'))
  await click(wrapper, '选择并验证压缩包')
  expect(mocks.select).not.toHaveBeenCalled()
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(mocks.create).not.toHaveBeenCalled()
})
test('upload rechecks lowered per-version quota before creating a version', async () => {
  mocks.mine.mockResolvedValue([{ scnid: 10, title: 'Project', fileIds: [], contentRevision: 1 }])
  mocks.select.mockResolvedValue({
    data: { selectionId: 'selection', size: 600000000, manifest: { version: '1.0.0' } },
  })
  const wrapper = render()
  await flushPromises()
  await click(wrapper, 'Project')
  await click(wrapper, '选择并验证压缩包')
  mocks.quota.mockResolvedValueOnce({ userId: 'user', maxProjects: 1, maxPackageBytes: 100000000 })
  await click(wrapper, '创建版本并上传')
  expect(mocks.version).not.toHaveBeenCalled()
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: expect.stringContaining('100000000') }),
  )
})
test('session changes while quota is pending block package picker', async () => {
  mocks.mine.mockResolvedValue([])
  const wrapper = render()
  await flushPromises()
  await click(wrapper, '创建作品')
  let resolve!: (value: unknown) => void
  mocks.quota.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes
      }),
  )
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '选择并验证压缩包')!
    .trigger('click')
  auth.snapshot.sessionId = 'other'
  resolve({ userId: 'user', maxProjects: 9, maxPackageBytes: 700000000 })
  await flushPromises()
  expect(mocks.select).not.toHaveBeenCalled()
  auth.snapshot.sessionId = 'session'
})

test('new upload supports raised quota and refreshes a 409 without creating another version', async () => {
  const { AccountError } = await import('../../../apis/internal/client')
  mocks.mine.mockResolvedValue([{ scnid: 10, title: 'Project', fileIds: [], contentRevision: 1 }])
  mocks.select.mockResolvedValue({
    data: { selectionId: 'selection', size: 600000000, manifest: { version: '1.0.0' } },
  })
  mocks.version.mockRejectedValueOnce(new AccountError('conflict'))
  const wrapper = render()
  await flushPromises()
  await click(wrapper, 'Project')
  await click(wrapper, '选择并验证压缩包')
  await click(wrapper, '创建版本并上传')
  expect(mocks.version).toHaveBeenCalledTimes(1)
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(mocks.quota).toHaveBeenCalledTimes(4)
  mocks.version.mockResolvedValueOnce({ id: 'version', version: '1.0.0', status: 'DRAFT' })
  mocks.upload.mockResolvedValueOnce({ data: { taskId: 'task', status: 'running' } })
  await click(wrapper, '创建版本并上传')
  expect(mocks.version).toHaveBeenCalledTimes(2)
  expect(mocks.upload).toHaveBeenCalledWith({ selectionId: 'selection', versionId: 'version' })
})
test('package selection rejects an oversized archive using the current limit', async () => {
  mocks.mine.mockResolvedValue([])
  mocks.select.mockResolvedValue({
    data: { selectionId: 'selection', size: 800000000, manifest: { version: '1.0.0' } },
  })
  const wrapper = render()
  await flushPromises()
  await click(wrapper, '创建作品')
  await click(wrapper, '选择并验证压缩包')
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: expect.stringContaining('700000000') }),
  )
  expect(wrapper.text()).not.toContain('从安装包填写资料')
})

test('external-only drafts save without selecting a package or creating a version even with zero byte quota', async () => {
  mocks.mine.mockResolvedValue([])
  mocks.create.mockResolvedValue({ scnid: 10, contentRevision: 1 })
  const wrapper = render()
  await flushPromises()
  mocks.quota.mockResolvedValue({
    userId: 'user',
    maxProjects: 9,
    maxPackageBytes: 0,
    maxStorageBytes: 0,
    usedStorageBytes: 0,
  })
  await click(wrapper, '创建作品')
  await wrapper.findAll('input')[0]!.setValue('External project')
  await click(wrapper, '添加下载外链')
  await wrapper.findAll('input')[3]!.setValue('https://download.example.test/file.zip')
  await wrapper.findAll('input')[4]!.setValue('Download instructions')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(mocks.create).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      downloadLinks: [
        { url: 'https://download.example.test/file.zip', description: 'Download instructions' },
      ],
    }),
  )
  expect(mocks.select).not.toHaveBeenCalled()
  expect(mocks.version).not.toHaveBeenCalled()
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('5000000000 / 0')
})
test('editing links does not mutate the owner response and supports clearing all links', async () => {
  const project = {
    scnid: 10,
    title: 'Project',
    fileIds: [],
    contentRevision: 1,
    downloadLinks: [{ url: 'https://example.test', description: 'Original' }],
  }
  mocks.mine.mockResolvedValue([project])
  const wrapper = render()
  await flushPromises()
  await click(wrapper, 'Project')
  await wrapper.findAll('input')[3]!.setValue('https://changed.example.test')
  expect(project.downloadLinks[0]!.url).toBe('https://example.test')
  await click(wrapper, '移除外链')
  mocks.update.mockResolvedValue({ scnid: 10, contentRevision: 2 })
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(mocks.update).toHaveBeenCalledWith(
    {},
    10,
    1,
    expect.objectContaining({ downloadLinks: [] }),
  )
})
test('quota read errors do not hide the external-link editor', async () => {
  gate.quotaError = new Error('offline')
  mocks.mine.mockResolvedValue([])
  const wrapper = render()
  await flushPromises()
  await click(wrapper, '创建作品')
  expect(wrapper.find('form').exists()).toBe(true)
  await click(wrapper, '添加下载外链')
  expect(wrapper.findAll('button').some((button) => button.text() === '移除外链')).toBe(true)
})
