import type {
  AiAssistantStatus,
  AiOperationRecord,
} from '@scnexus/app-shared/types/ai-assistant.type'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { IpcResult } from '@scnexus/app-shared/errors/app.error'
import type { SettingSnapshot } from '@scnexus/app-shared/types/desktop.type'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import AiAssistantView from '../AiAssistantView.vue'
import { useAiAssistantStore } from '../../../stores/ai-assistant'
import { useContentCenterStore } from '../../../stores/content-center'
import zh from '../../../locales/zh'
import zhAssistant from '../../../locales/zh/aiAssistant.json'
import hantAssistant from '../../../locales/zh-Hant/aiAssistant.json'
import enAssistant from '../../../locales/en/aiAssistant.json'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn<() => Promise<IpcResult<AiAssistantStatus>>>(),
  list: vi.fn<() => Promise<IpcResult<AiOperationRecord[]>>>(),
  start: vi.fn<(port: number) => Promise<IpcResult<AiAssistantStatus>>>(),
  stop: vi.fn<() => Promise<IpcResult<AiAssistantStatus>>>(),
  info: vi.fn<() => Promise<IpcResult<{ url: string; token: string }>>>(),
  rotate: vi.fn<() => Promise<IpcResult<undefined>>>(),
  clear: vi.fn<() => Promise<IpcResult<undefined>>>(),
  snapshot: vi.fn<() => Promise<IpcResult<Partial<SettingSnapshot>>>>(),
  offSettings: vi.fn<() => void>(),
  settings: undefined as undefined | ((value: SettingSnapshot) => void),
  update: vi.fn<(patch: unknown) => Promise<IpcResult<Partial<SettingSnapshot>>>>(),
  toast: vi.fn<(value: unknown) => void>(),
  offStatus: vi.fn<() => void>(),
  offRecord: vi.fn<() => void>(),
  status: undefined as undefined | ((value: AiAssistantStatus) => void),
  record: undefined as undefined | ((value: AiOperationRecord) => void),
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('../../../ipcs', () => ({
  ipcAiAssistantGetStatus: mocks.getStatus,
  ipcAiAssistantListRecords: mocks.list,
  ipcAiAssistantStart: mocks.start,
  ipcAiAssistantStop: mocks.stop,
  ipcAiAssistantGetConnectionInfo: mocks.info,
  ipcAiAssistantRegenerateToken: mocks.rotate,
  ipcAiAssistantClearRecords: mocks.clear,
  ipcAiAssistantOnStatusChanged: (cb: typeof mocks.status) => {
    mocks.status = cb
    return mocks.offStatus
  },
  ipcAiAssistantOnRecordChanged: (cb: typeof mocks.record) => {
    mocks.record = cb
    return mocks.offRecord
  },
  ipcSettingGetSnapshot: mocks.snapshot,
  ipcSettingOnChanged: (cb: typeof mocks.settings) => {
    mocks.settings = cb
    return mocks.offSettings
  },
  ipcSettingUpdate: mocks.update,
}))
const button = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})
const card = defineComponent({ template: '<div><slot /></div>' })
const input = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})
const approvalSwitch = defineComponent({
  props: ['modelValue', 'disabled', 'label'],
  emits: ['update:modelValue'],
  template: `<button role="switch" :aria-checked="modelValue" :disabled="disabled"
    @click="$emit('update:modelValue', !modelValue)">{{ label }}</button>`,
})
const modal = defineComponent({
  props: ['open'],
  template: '<div v-if="open"><slot name="body"/><slot name="footer"/></div>',
})
const tabs = defineComponent({
  props: ['items', 'modelValue'],
  emits: ['update:modelValue'],
  template: `<div><div role="tablist"><button v-for="item in items" :key="item.value" role="tab"
    :aria-selected="modelValue === item.value" @click="$emit('update:modelValue', item.value)">{{ item.label }}</button></div>
    <slot :name="items.find(item => item.value === modelValue)?.slot" /></div>`,
})
const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('scnexus', {})
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined) },
    configurable: true,
  })
  mocks.getStatus.mockResolvedValue({ ok: true, data: { state: 'stopped', port: 17861 } })
  mocks.list.mockResolvedValue({ ok: true, data: [] })
  mocks.start.mockResolvedValue({ ok: true, data: { state: 'running', port: 17861 } })
  mocks.stop.mockResolvedValue({ ok: true, data: { state: 'stopped', port: 17861 } })
  mocks.info.mockResolvedValue({
    ok: true,
    data: { url: 'http://127.0.0.1:17861/mcp', token: 'SECRET' },
  })
  mocks.rotate.mockResolvedValue({ ok: true, data: undefined })
  mocks.clear.mockResolvedValue({ ok: true, data: undefined })
  mocks.snapshot.mockResolvedValue({
    ok: true,
    data: { aiAssistantEnabled: true, aiAssistantPort: 17861 },
  })
  mocks.update.mockResolvedValue({
    ok: true,
    data: { aiAssistantEnabled: true, aiAssistantPort: 17861 },
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})
async function render(enabled = true) {
  const center = useContentCenterStore()
  center.initialized = true
  center.aiAssistantEnabled = enabled
  const wrapper = mount(AiAssistantView, {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh', flatJson: true, messages: { zh } })],
      stubs: {
        Switch: approvalSwitch,
        Button: button,
        Tabs: tabs,
        Card: card,
        Input: input,
        Textarea: input,
        FormField: card,
        Alert: defineComponent({
          props: ['title', 'description'],
          template: '<div>{{ title }} {{ description }}</div>',
        }),
        Badge: card,
        Modal: modal,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
function click(wrapper: Awaited<ReturnType<typeof render>>, label: string) {
  return wrapper
    .findAll('button')
    .find((b) => b.text() === label)!
    .trigger('click')
}
test('disabled direct route renders no controls or service requests', async () => {
  const wrapper = await render(false)
  expect(wrapper.findAll('button')).toHaveLength(0)
  expect(mocks.getStatus).not.toHaveBeenCalled()
  expect(mocks.start).not.toHaveBeenCalled()
  expect(mocks.info).not.toHaveBeenCalled()
})
test('validates ports and saves preference before manually starting', async () => {
  const wrapper = await render()
  await wrapper.get('input').setValue('1023')
  await click(wrapper, '启动服务')
  expect(mocks.start).not.toHaveBeenCalled()
  await wrapper.get('input').setValue('17861')
  await click(wrapper, '启动服务')
  await flushPromises()
  expect(mocks.update).toHaveBeenCalledWith({ aiAssistantPort: 17861 })
  expect(mocks.start).toHaveBeenCalledWith(17861)
  expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.start.mock.invocationCallOrder[0]!,
  )
  expect(wrapper.get('input').attributes('disabled')).toBeDefined()
  expect(mocks.info).not.toHaveBeenCalled()
})
test('retrieves secrets only explicitly and clears them on stop without adding them to Pinia', async () => {
  mocks.getStatus.mockResolvedValue({ ok: true, data: { state: 'running', port: 17861 } })
  const wrapper = await render()
  expect(wrapper.html()).not.toContain('SECRET')
  await click(wrapper, '显示令牌')
  await flushPromises()
  expect(wrapper.html()).toContain('SECRET')
  expect(JSON.stringify(useAiAssistantStore().$state)).not.toContain('SECRET')
  await click(wrapper, '停止服务')
  await flushPromises()
  expect(wrapper.html()).not.toContain('SECRET')
  expect(mocks.info).toHaveBeenCalledTimes(1)
})
test('rotation requires confirmation; config is copied as generic HTTP without retaining secrets', async () => {
  mocks.getStatus.mockResolvedValue({ ok: true, data: { state: 'running', port: 17861 } })
  const wrapper = await render()
  await click(wrapper, '重新生成令牌')
  expect(mocks.rotate).not.toHaveBeenCalled()
  const confirms = wrapper.findAll('button').filter((b) => b.text() === '重新生成令牌')
  await confirms.at(-1)!.trigger('click')
  await flushPromises()
  expect(mocks.rotate).toHaveBeenCalledTimes(1)
  await click(wrapper, '复制连接配置')
  await flushPromises()
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('Bearer SECRET'),
  )
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('"type": "http"'),
  )
  expect(wrapper.html()).not.toContain('SECRET')
  useContentCenterStore().aiAssistantEnabled = false
  await flushPromises()
  expect(wrapper.html()).not.toContain('SECRET')
  expect(mocks.offStatus).toHaveBeenCalled()
  expect(mocks.offRecord).toHaveBeenCalled()
})
test('records deduplicate, remain capped at 500, survive stop, and clear only on success', async () => {
  const wrapper = await render()
  await click(wrapper, '操作记录')
  for (let i = 0; i < 501; i++)
    mocks.record!({ id: String(i), toolName: 'get_app_status', status: 'running', startedAt: i })
  mocks.record!({
    id: '500',
    toolName: 'get_app_status',
    status: 'succeeded',
    startedAt: 500,
    finishedAt: 501,
  })
  const store = useAiAssistantStore()
  expect(store.records).toHaveLength(500)
  expect(store.records.at(-1)?.status).toBe('succeeded')
  mocks.status!({ state: 'stopped', port: 17861 })
  expect(store.records).toHaveLength(500)
  mocks.clear.mockResolvedValueOnce({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.IPC_INVALID_ARGUMENT, { message: 'SECRET' })),
  })
  await flushPromises()
  await click(wrapper, '清空记录')
  await flushPromises()
  expect(store.records).toHaveLength(500)
  expect(JSON.stringify(mocks.toast.mock.calls)).not.toContain('SECRET')
  await click(wrapper, '清空记录')
  await flushPromises()
  expect(store.records).toHaveLength(0)
  wrapper.unmount()
  expect(mocks.offStatus).toHaveBeenCalled()
  expect(mocks.offRecord).toHaveBeenCalled()
})

test('status and record events during refresh do not discard history or overwrite newer records', async () => {
  const store = useAiAssistantStore()
  const dispose = store.subscribe()
  let resolve!: (value: IpcResult<AiOperationRecord[]>) => void
  mocks.list.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const refresh = store.refresh()
  mocks.status!({ state: 'running', port: 17861 })
  mocks.record!({ id: 'live', toolName: 'get_app_status', status: 'succeeded', startedAt: 2 })
  resolve({
    ok: true,
    data: [
      { id: 'existing', toolName: 'list_campaigns', status: 'succeeded', startedAt: 1 },
      { id: 'live', toolName: 'get_app_status', status: 'running', startedAt: 2 },
    ],
  })
  await refresh
  expect(store.status.state).toBe('running')
  expect(store.records.map((item) => item.id)).toEqual(['existing', 'live'])
  expect(store.records.at(-1)?.status).toBe('succeeded')
  dispose()
})

test('late token responses after disable never display or copy credentials', async () => {
  mocks.getStatus.mockResolvedValue({ ok: true, data: { state: 'running', port: 17861 } })
  const wrapper = await render()
  let resolve!: (value: IpcResult<{ url: string; token: string }>) => void
  mocks.info.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await click(wrapper, '复制令牌')
  useContentCenterStore().aiAssistantEnabled = false
  await flushPromises()
  resolve({ ok: true, data: { url: 'http://127.0.0.1:17861/mcp', token: 'SECRET' } })
  await flushPromises()
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  expect(wrapper.html()).not.toContain('SECRET')
})

test('clearing history invalidates late history snapshots', async () => {
  const store = useAiAssistantStore()
  const dispose = store.subscribe()
  let resolve!: (value: IpcResult<AiOperationRecord[]>) => void
  mocks.list.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const refresh = store.refresh()
  await store.clearRecords()
  resolve({
    ok: true,
    data: [{ id: 'old', toolName: 'list_campaigns', status: 'succeeded', startedAt: 1 }],
  })
  await refresh
  expect(store.records).toHaveLength(0)
  dispose()
})

test('tabs separate configuration, history and the twelve controlled capabilities in order', async () => {
  const wrapper = await render()
  expect(wrapper.findAll('[role="tab"]').map((item) => item.text())).toEqual([
    '服务配置',
    'MCP 能力',
    '操作记录',
  ])
  expect(wrapper.get('[aria-selected="true"]').text()).toBe('服务配置')
  expect(wrapper.find('h1').exists()).toBe(false)
  expect(wrapper.text()).toContain('客户端认证')
  expect(wrapper.text()).toContain('http://127.0.0.1:17861/mcp')
  expect(wrapper.text()).not.toContain('暂无操作记录')
  await click(wrapper, '操作记录')
  expect(wrapper.text()).toContain('暂无操作记录')
  expect(wrapper.find('input').exists()).toBe(false)
  await click(wrapper, 'MCP 能力')
  expect(wrapper.findAll('code').map((item) => item.text())).toEqual([
    'get_app_status',
    'list_campaigns',
    'get_campaign_details',
    'list_custom_content',
    'list_downloads',
    'get_task_status',
    'activate_campaign',
    'switch_campaign',
    'restore_campaign',
    'uninstall_campaign',
    'list_mutators',
    'get_weekly_mutation',
  ])
  expect(wrapper.findAll('[data-access="read"]')).toHaveLength(8)
  expect(wrapper.findAll('[data-access="action"]')).toHaveLength(2)
  expect(wrapper.findAll('[data-access="confirmation"]')).toHaveLength(2)
  expect(wrapper.get('.grid').classes()).toContain('grid-cols-2')
  expect(wrapper.get('.grid').classes()).toContain('overflow-y-auto')
  expect(wrapper.text()).toContain('limit（integer）默认 20，范围 1–100')
  expect(wrapper.text()).toContain('offset（integer）默认 0，范围 0–100000')
  expect(wrapper.text()).toContain('1–200 个字符')
  expect(wrapper.text()).toContain('激活仅在无冲突时直接修改文件')
  expect(wrapper.text()).toContain('确认一次当前战役→目标战役')
  expect(wrapper.text()).toContain('原生 Electron 确认，可分别开启自动批准')
  expect(wrapper.text()).toContain('文件冲突须在现有界面手动审核')
  expect(wrapper.text()).toContain('仅同时开启官方服务和每周突变校准')
  expect(wrapper.text()).toContain('search（string）≤100 字符')
  expect(wrapper.text()).toContain('zhCN/enUS/ruRU/koKR/frFR/deDE')
  expect(wrapper.text()).toContain('region（string）：CN/NA/EU/AS，默认 CN')
  expect(wrapper.find('input').exists()).toBe(false)
  expect(mocks.info).not.toHaveBeenCalled()
  expect(mocks.stop).not.toHaveBeenCalled()
  expect(mocks.offStatus).not.toHaveBeenCalled()
  expect(mocks.offRecord).not.toHaveBeenCalled()
  await click(wrapper, '服务配置')
  expect(mocks.getStatus).toHaveBeenCalledTimes(1)
  expect(mocks.info).not.toHaveBeenCalled()
})

test.each([zhAssistant, hantAssistant, enAssistant])(
  'assistant locales document controlled actions and all twelve tools',
  (messages) => {
    const toolKeys = Object.keys(messages).filter(
      (key) => key.startsWith('aiAssistant.tool.') && key !== 'aiAssistant.tool.unknown',
    )
    expect(toolKeys).toHaveLength(12)
    expect(Object.keys(messages).sort()).toEqual(Object.keys(zhAssistant).sort())
    expect(messages['aiAssistant.readOnly']).toContain('MCP')
    expect(messages['aiAssistant.readOnly']).not.toMatch(/只读|只讀|read.only/i)
    expect(messages['aiAssistant.tool.unknown']).not.toMatch(/只读|只讀|read.only/i)
    expect(messages['aiAssistant.security']).toContain('Electron')
    expect(messages['aiAssistant.capabilitiesSafety']).toContain('12')
    expect(messages['aiAssistant.capabilitiesSafety']).toMatch(/shell/i)
    expect(messages['aiAssistant.limit.mutators']).toContain('zhCN/enUS/ruRU/koKR/frFR/deDE')
    expect(messages['aiAssistant.limit.weeklyMutation']).toContain('CN/NA/EU/AS')
  },
)

test('leaving configuration hides credentials and preserves service subscriptions', async () => {
  mocks.getStatus.mockResolvedValue({ ok: true, data: { state: 'running', port: 17861 } })
  const wrapper = await render()
  await click(wrapper, '显示令牌')
  await flushPromises()
  expect(wrapper.html()).toContain('SECRET')
  await click(wrapper, '操作记录')
  mocks.record!({ id: 'live', toolName: 'get_app_status', status: 'succeeded', startedAt: 1 })
  await flushPromises()
  expect(wrapper.text()).toContain('获取应用状态')
  await click(wrapper, '服务配置')
  expect(wrapper.html()).not.toContain('SECRET')
  expect(mocks.info).toHaveBeenCalledTimes(1)
  expect(mocks.stop).not.toHaveBeenCalled()
  expect(mocks.offStatus).not.toHaveBeenCalled()
  expect(mocks.offRecord).not.toHaveBeenCalled()
})

test.each(['显示令牌', '复制令牌', '复制连接配置'])(
  'tab changes invalidate pending %s responses even after returning',
  async (label) => {
    mocks.getStatus.mockResolvedValue({ ok: true, data: { state: 'running', port: 17861 } })
    const wrapper = await render()
    let resolve!: (value: IpcResult<{ url: string; token: string }>) => void
    mocks.info.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await click(wrapper, label)
    await click(wrapper, 'MCP 能力')
    await click(wrapper, '服务配置')
    resolve({ ok: true, data: { url: 'http://127.0.0.1:17861/mcp', token: 'SECRET' } })
    await flushPromises()
    expect(wrapper.html()).not.toContain('SECRET')
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalledTimes(1)
  },
)
const approvalKeys = [
  'aiAutoApproveSwitchCampaign',
  'aiAutoApproveRestoreCampaign',
  'aiAutoApproveUninstallCampaign',
] as const

test.each(approvalKeys)(
  'persists %s independently, without starting MCP or fetching credentials',
  async (key) => {
    const saved = { aiAssistantEnabled: true, aiAssistantPort: 17861, [key]: true }
    mocks.update.mockResolvedValue({ ok: true, data: saved })
    const wrapper = await render()
    await click(wrapper, 'MCP 能力')
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(3)
    expect(
      wrapper.findAll('[data-approval]').map((item) => item.attributes('data-approval')),
    ).toEqual(approvalKeys)
    expect(wrapper.findAll('[aria-checked="true"]')).toHaveLength(0)
    const control = wrapper.get(`[data-approval="${key}"]`)
    expect(control.attributes('disabled')).toBeUndefined()
    await control.trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith({ [key]: true })
    expect(control.attributes('aria-checked')).toBe('true')
    expect(wrapper.findAll('[aria-checked="true"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('自动批准')
    mocks.snapshot.mockResolvedValue({ ok: true, data: saved })
    wrapper.unmount()
    const reopened = await render()
    await click(reopened, 'MCP 能力')
    expect(reopened.get(`[data-approval="${key}"]`).attributes('aria-checked')).toBe('true')
    mocks.update.mockResolvedValue({ ok: true, data: { ...saved, [key]: false } })
    await reopened.get(`[data-approval="${key}"]`).trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenLastCalledWith({ [key]: false })
    expect(reopened.findAll('[aria-checked="true"]')).toHaveLength(0)
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.info).not.toHaveBeenCalled()
  },
)

test('does not optimistically enable approval and disables all switches during native approval', async () => {
  let resolve!: (result: IpcResult<Partial<SettingSnapshot>>) => void
  mocks.update.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const wrapper = await render()
  await click(wrapper, 'MCP 能力')
  await wrapper.get('[data-approval="aiAutoApproveRestoreCampaign"]').trigger('click')
  expect(wrapper.findAll('[aria-checked="true"]')).toHaveLength(0)
  expect(wrapper.findAll('[role="switch"][disabled]')).toHaveLength(3)
  resolve({ ok: true, data: { aiAutoApproveRestoreCampaign: true } })
  await flushPromises()
  expect(
    wrapper.get('[data-approval="aiAutoApproveRestoreCampaign"]').attributes('aria-checked'),
  ).toBe('true')
  expect(wrapper.findAll('[role="switch"][disabled]')).toHaveLength(0)
})

test.each(['denied', 'rejected'] as const)(
  '%s approval keeps it off and reloads saved preferences',
  async (mode) => {
    const wrapper = await render()
    await click(wrapper, 'MCP 能力')
    if (mode === 'denied')
      mocks.update.mockResolvedValueOnce({
        ok: false,
        error: toErrorDto(new AppError(ERRORS.TASK_CANCELLED)),
      })
    else mocks.update.mockRejectedValueOnce(new Error('write failed'))
    await wrapper.get('[data-approval="aiAutoApproveSwitchCampaign"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[aria-checked="true"]')).toHaveLength(0)
    expect(mocks.snapshot).toHaveBeenCalledTimes(2)
    expect(mocks.toast).toHaveBeenCalledTimes(mode === 'denied' ? 0 : 1)
  },
)

test('refreshes actual partially saved permissions after update failure', async () => {
  const wrapper = await render()
  await click(wrapper, 'MCP 能力')
  mocks.update.mockRejectedValueOnce(new Error('later write failed'))
  mocks.snapshot.mockResolvedValueOnce({ ok: true, data: { aiAutoApproveUninstallCampaign: true } })
  await wrapper.get('[data-approval="aiAutoApproveUninstallCampaign"]').trigger('click')
  await flushPromises()
  expect(
    wrapper.get('[data-approval="aiAutoApproveUninstallCampaign"]').attributes('aria-checked'),
  ).toBe('true')
})

test('reloads preferences when AI is enabled and reflects external settings, cleaning up on unmount', async () => {
  const wrapper = await render(false)
  expect(mocks.snapshot).not.toHaveBeenCalled()
  mocks.snapshot.mockResolvedValue({ ok: true, data: { aiAutoApproveRestoreCampaign: true } })
  useContentCenterStore().aiAssistantEnabled = true
  await flushPromises()
  await click(wrapper, 'MCP 能力')
  expect(
    wrapper.get('[data-approval="aiAutoApproveRestoreCampaign"]').attributes('aria-checked'),
  ).toBe('true')
  mocks.settings!({ aiAutoApproveUninstallCampaign: true } as SettingSnapshot)
  await flushPromises()
  expect(
    wrapper.get('[data-approval="aiAutoApproveRestoreCampaign"]').attributes('aria-checked'),
  ).toBe('false')
  expect(
    wrapper.get('[data-approval="aiAutoApproveUninstallCampaign"]').attributes('aria-checked'),
  ).toBe('true')
  wrapper.unmount()
  expect(mocks.offSettings).toHaveBeenCalledTimes(1)
})

test('keeps permission controls disabled until saved preferences load', async () => {
  let resolve!: (result: IpcResult<Partial<SettingSnapshot>>) => void
  mocks.snapshot.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const wrapper = await render()
  await click(wrapper, 'MCP 能力')
  expect(wrapper.findAll('[role="switch"][disabled]')).toHaveLength(3)
  resolve({ ok: true, data: {} })
  await flushPromises()
  expect(wrapper.findAll('[role="switch"][disabled]')).toHaveLength(0)
})

test('awaits saved false preferences after failed write before re-enabling switches', async () => {
  mocks.snapshot.mockResolvedValueOnce({ ok: true, data: { aiAutoApproveRestoreCampaign: true } })
  const wrapper = await render()
  await click(wrapper, 'MCP 能力')
  mocks.update.mockRejectedValueOnce(new Error('partial write'))
  let resolve!: (result: IpcResult<Partial<SettingSnapshot>>) => void
  mocks.snapshot.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await wrapper.get('[data-approval="aiAutoApproveRestoreCampaign"]').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('[role="switch"][disabled]')).toHaveLength(3)
  expect(
    wrapper.get('[data-approval="aiAutoApproveRestoreCampaign"]').attributes('aria-checked'),
  ).toBe('true')
  resolve({ ok: true, data: { aiAutoApproveRestoreCampaign: false } })
  await flushPromises()
  expect(
    wrapper.get('[data-approval="aiAutoApproveRestoreCampaign"]').attributes('aria-checked'),
  ).toBe('false')
  expect(wrapper.findAll('[role="switch"][disabled]')).toHaveLength(0)
})
