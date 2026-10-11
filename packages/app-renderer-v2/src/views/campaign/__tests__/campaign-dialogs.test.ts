import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import type { Plugin } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type {
  AnalysisResult,
  ContentRecord,
  InstallProgress,
} from '@scnexus/app-shared/types/content.type'
import type { useCampaign } from '../useCampaign'
import CampaignInstallModal from '../components/CampaignInstallModal.vue'
import CampaignOperationModal from '../components/CampaignOperationModal.vue'
import zh from '../../../locales/zh.json'

const tree = {
  kind: 'directory',
  name: 'source',
  path: '',
  bytes: 12,
  modifiedAt: null,
  children: [],
}
const record = {
  localId: 'new',
  package: {
    name: 'Test campaign',
    campaign: 'WOL',
    type: 'campaign',
    author: 'Author',
    version: '1.2',
  },
  mode: 'scnexus',
  fileCount: 1,
  bytes: 12,
  managementDirectory: 'D:\\Game\\Library',
  payloadDirectory: 'D:\\Game\\Library\\Payload',
  installedFiles: [{ result: 'copied' }],
  targetTree: tree,
} as unknown as ContentRecord
const preview = {
  package: record.package,
  fileCount: 1,
  bytes: 12,
  origin: 'package-json',
  targetTree: tree,
  descriptorPath: 'package.json',
}
const analysis = {
  analysisId: 'analysis',
  source: { kind: 'directory', path: 'D:\\Package' },
  sourceTree: tree,
  sourceStats: { fileCount: 2, bytes: 24 },
  recommendedMode: 'scnexus',
  modes: {
    scnexus: preview,
    ccm: { ...preview, package: { ...record.package, name: 'CCM campaign' } },
    auto: null,
  },
  diagnostics: [],
} as unknown as AnalysisResult
function service() {
  const state = {
    analysis: ref<AnalysisResult | null>(analysis),
    preview: ref(preview),
    mode: ref('scnexus'),
    busy: ref(false),
    error: ref(null),
    installProgress: ref<InstallProgress | null>(null),
    existing: ref([]),
    conflicts: ref([]),
    activation: ref(null),
    removal: ref(null),
    records: ref([record]),
    active: ref({}),
    confirm: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    prepare: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    close: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  }
  state.close.mockImplementation(async () => {
    state.analysis.value = null
    state.activation.value = null
    state.removal.value = null
  })
  return state
}
const modal = defineComponent({
  props: ['open', 'title', 'dismissible', 'close'],
  template: '<div v-if="open"><h2>{{ title }}</h2><slot name="body" /><slot name="footer" /></div>',
})
const button = defineComponent({
  props: ['disabled', 'loading'],
  emits: ['click'],
  template:
    '<button :disabled="disabled || loading" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>',
})
const passThrough = defineComponent({ template: '<div><slot /></div>' })
const wrappers: { unmount: () => void }[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})
function render(
  component: typeof CampaignInstallModal | typeof CampaignOperationModal,
  props: Record<string, unknown>,
) {
  const wrapper = mount(component, {
    props: props as never,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh', messages: { zh } }) as unknown as Plugin],
      stubs: {
        Modal: modal,
        Button: button,
        Alert: true,
        Progress: true,
        Separator: true,
        Tabs: true,
        Select: true,
        ConflictChoices: true,
        FileTree: true,
        Badge: passThrough,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
function click(wrapper: ReturnType<typeof render>, text: string) {
  const target = wrapper.findAll('button').find((item) => item.text() === text)
  expect(target).toBeDefined()
  return target!.trigger('click')
}

test('installation previews metadata and mode-specific files before confirmation, then retains the actual result', async () => {
  const state = service()
  let complete!: (value: unknown) => void
  state.confirm.mockImplementation(() => {
    state.busy.value = true
    return new Promise((resolve) => {
      complete = resolve
    })
  })
  const wrapper = render(CampaignInstallModal, {
    open: true,
    service: state as unknown as ReturnType<typeof useCampaign>,
  })
  expect(state.confirm).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('Test campaign')
  expect(wrapper.text()).toContain('Author')
  expect(wrapper.text()).toContain('1.2')
  state.mode.value = 'ccm'
  state.preview.value = analysis.modes.ccm as unknown as typeof preview
  await nextTick()
  expect(wrapper.text()).toContain('CCM campaign')
  await click(wrapper, '确认安装')
  expect(wrapper.find('u-modal-stub').exists()).toBe(false)
  expect(wrapper.find('button[data-loading="true"]').exists()).toBe(true)
  expect(wrapper.findAll('button').every((item) => item.attributes('disabled') !== undefined)).toBe(
    true,
  )
  state.analysis.value = null
  state.busy.value = false
  complete({ installed: record })
  await flushPromises()
  expect(wrapper.text()).toContain('安装完成')
  expect(wrapper.text()).toContain('Test campaign')
  await click(wrapper, '立即激活')
  expect(wrapper.emitted('activate')?.[0]).toEqual([record])
  expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
})

test('existing installations prevent installation, while new installation conflicts default to overwrite', async () => {
  const state = service()
  state.existing.value = [{ directory: 'existing', package: record.package }] as never
  const wrapper = render(CampaignInstallModal, {
    open: true,
    service: state as unknown as ReturnType<typeof useCampaign>,
  })
  await click(wrapper, '确认安装')
  expect(state.confirm).not.toHaveBeenCalled()
  state.existing.value = []
  state.conflicts.value = [{ conflictId: 'conflict' }] as never
  await nextTick()
  await click(wrapper, '确认安装')
  expect(state.confirm).toHaveBeenCalledWith([{ conflictId: 'conflict', action: 'overwrite' }], [])
})

test('activation requires confirmation and keeps the action loading until completion', async () => {
  const state = service()
  state.prepare.mockImplementation(async () => {
    state.activation.value = { activationId: 'a' } as never
  })
  let complete!: (value: unknown) => void
  state.confirm.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve
    }),
  )
  const wrapper = render(CampaignOperationModal, {
    service: state as unknown as ReturnType<typeof useCampaign>,
    request: null,
  })
  await wrapper.setProps({ request: { record, action: 'activate' } })
  await flushPromises()
  expect(state.prepare).toHaveBeenCalledWith(record, 'activate')
  expect(state.confirm).not.toHaveBeenCalled()
  await click(wrapper, '确认执行')
  expect(wrapper.find('button[data-loading="true"]').exists()).toBe(true)
  complete({ installed: null })
  await flushPromises()
  expect(wrapper.emitted('completed')?.[0]).toEqual(['activate'])
  expect(wrapper.emitted('close')).toHaveLength(1)
})

test.each(['activate', 'uninstall'] as const)(
  'active campaign %s restores first, then requires a second confirmation',
  async (action) => {
    const state = service()
    const previous = action === 'uninstall' ? record : { ...record, localId: 'old' }
    state.records.value = [previous, record]
    state.active.value = { WOL: { localId: previous.localId } }
    state.prepare.mockImplementation(async (_record, requested) => {
      state.removal.value =
        requested === 'deactivate' || requested === 'uninstall'
          ? ({ operation: requested, files: [] } as never)
          : null
      state.activation.value = requested === 'activate' ? ({ activationId: 'a' } as never) : null
    })
    state.confirm.mockImplementation(async () => {
      state.removal.value = null
      state.activation.value = null
      return { installed: null }
    })
    const wrapper = render(CampaignOperationModal, {
      service: state as unknown as ReturnType<typeof useCampaign>,
      request: null,
    })
    await wrapper.setProps({ request: { record, action } })
    await flushPromises()
    expect(state.prepare).toHaveBeenNthCalledWith(1, previous, 'deactivate')
    await click(wrapper, '确认执行')
    await flushPromises()
    expect(state.prepare).toHaveBeenNthCalledWith(2, record, action)
    expect(state.confirm).toHaveBeenCalledOnce()
    expect(wrapper.emitted('close')).toBeUndefined()
    await click(wrapper, '确认执行')
    await flushPromises()
    expect(state.confirm).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('completed')).toEqual([['deactivate'], [action]])
  },
)

test('operation failure closes the dialog without reporting success', async () => {
  const state = service()
  state.prepare.mockImplementation(async () => {
    state.activation.value = { activationId: 'a' } as never
  })
  state.confirm.mockResolvedValue(undefined)
  const wrapper = render(CampaignOperationModal, {
    service: state as unknown as ReturnType<typeof useCampaign>,
    request: null,
  })
  await wrapper.setProps({ request: { record, action: 'activate' } })
  await flushPromises()
  await click(wrapper, '确认执行')
  await flushPromises()
  expect(state.close).toHaveBeenCalledOnce()
  expect(wrapper.emitted('close')).toHaveLength(1)
  expect(wrapper.emitted('completed')).toBeUndefined()
})

test('extraction progress is separate from file commit counts and never implies installation is complete', async () => {
  const state = service()
  let finish!: (result: unknown) => void
  state.confirm.mockImplementation(() => {
    state.busy.value = true
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const wrapper = render(CampaignInstallModal, {
    open: true,
    service: state as unknown as ReturnType<typeof useCampaign>,
  })
  await click(wrapper, '确认安装')
  const progress = {
    taskId: 'task',
    analysisId: 'analysis',
    stage: 'preparing',
    completedFiles: 0,
    totalFiles: 5,
    currentFile: null,
  } as InstallProgress
  state.installProgress.value = progress
  await nextTick()
  expect(wrapper.text()).toContain('正在检查安装条件')
  expect(wrapper.text()).not.toContain('0 / 5')
  state.installProgress.value = { ...progress, stage: 'extracting' }
  await nextTick()
  expect(wrapper.text()).toContain('正在解压安装文件')
  expect(wrapper.text()).not.toContain('0%')
  expect(wrapper.text()).not.toContain('0 / 5')
  state.installProgress.value = { ...progress, stage: 'extracting', percent: 100 }
  await nextTick()
  expect(wrapper.text()).toContain('100%')
  expect(wrapper.text()).not.toContain('安装完成')
  expect(wrapper.find('button[data-loading="true"]').exists()).toBe(true)
  state.installProgress.value = { ...progress, stage: 'copying', completedFiles: 2 }
  await nextTick()
  expect(wrapper.text()).toContain('正在安装与提交文件')
  expect(wrapper.text()).toContain('2 / 5')
  expect(wrapper.text()).toContain('40%')
  expect(wrapper.text()).not.toContain('100%')
  state.installProgress.value = { ...progress, stage: 'finalizing', completedFiles: 5 }
  await nextTick()
  expect(wrapper.text()).toContain('正在保存安装结果')
  expect(wrapper.text()).not.toContain('安装完成')
  state.busy.value = false
  finish({ installed: record })
  await flushPromises()
  expect(wrapper.text()).toContain('安装完成')
})

test('mode changes and reopening installation reset conflicts to overwrite without submitting stale IDs', async () => {
  const state = service()
  state.conflicts.value = [{ conflictId: 'scnexus-file' }] as never
  const wrapper = render(CampaignInstallModal, {
    open: true,
    service: state as unknown as ReturnType<typeof useCampaign>,
  })
  const choices = wrapper.findComponent({ name: 'ConflictChoices' })
  choices.vm.$emit('update:modelValue', [{ conflictId: 'scnexus-file', action: 'keep' }])
  await nextTick()
  expect(choices.props('modelValue')).toEqual([{ conflictId: 'scnexus-file', action: 'keep' }])
  state.mode.value = 'ccm'
  state.conflicts.value = [{ conflictId: 'ccm-file' }] as never
  await nextTick()
  expect(choices.props('modelValue')).toEqual([{ conflictId: 'ccm-file', action: 'overwrite' }])
  choices.vm.$emit('update:modelValue', [{ conflictId: 'ccm-file', action: 'keep' }])
  await nextTick()
  await wrapper.setProps({ open: false })
  await wrapper.setProps({ open: true })
  await nextTick()
  expect(wrapper.findComponent({ name: 'ConflictChoices' }).props('modelValue')).toEqual([
    { conflictId: 'ccm-file', action: 'overwrite' },
  ])
  await click(wrapper, '确认安装')
  expect(state.confirm).toHaveBeenCalledWith([{ conflictId: 'ccm-file', action: 'overwrite' }], [])
})

test('activation conflicts still require an explicit decision rather than installation overwrite defaults', async () => {
  const state = service()
  state.conflicts.value = [{ conflictId: 'activation-conflict' }] as never
  state.prepare.mockImplementation(async () => {
    state.activation.value = { activationId: 'activation' } as never
  })
  const wrapper = render(CampaignOperationModal, {
    service: state as unknown as ReturnType<typeof useCampaign>,
    request: null,
  })
  await wrapper.setProps({ request: { record, action: 'activate' } })
  await flushPromises()
  await click(wrapper, '确认执行')
  expect(state.confirm).not.toHaveBeenCalled()
})
