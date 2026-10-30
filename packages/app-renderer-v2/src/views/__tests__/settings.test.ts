import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import type { Plugin } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { IpcResult } from '@scnexus/app-shared/errors/app.error'
import type {
  SettingPreferences,
  SettingSnapshot,
  TelemetryStatus,
} from '@scnexus/app-shared/types/desktop.type'
import type { GameSnapshot } from '@scnexus/app-shared/types/content-api.type'
import SettingsView from '../SettingsView.vue'
import zh from '../../locales/zh'

vi.mock('../../stores/content-center', () => ({
  useContentCenterStore: () => ({ accept: () => {} }),
}))
const mocks = vi.hoisted(() => ({
  toast: vi.fn<(value: unknown) => void>(),
  settings: vi.fn<() => Promise<IpcResult<SettingSnapshot>>>(),
  update: vi.fn<(patch: Partial<SettingPreferences>) => Promise<IpcResult<SettingSnapshot>>>(),
  dialog:
    vi.fn<(options: unknown) => Promise<IpcResult<{ canceled: boolean; filePaths: string[] }>>>(),
  game: vi.fn<() => Promise<IpcResult<GameSnapshot>>>(),
  configure: vi.fn<(path: string) => Promise<IpcResult<GameSnapshot>>>(),
  detect: vi.fn<() => Promise<IpcResult<GameSnapshot>>>(),
  path: vi.fn<(name: string) => Promise<IpcResult<string>>>(),
  open: vi.fn<(path: string) => Promise<IpcResult<string | undefined>>>(),
  telemetry: vi.fn<() => Promise<IpcResult<TelemetryStatus>>>(),
  stopTelemetry: vi.fn<() => void>(),
  onTelemetry: undefined as ((status: TelemetryStatus) => void) | undefined,
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('../../ipcs', () => ({
  ipcSettingGetSnapshot: mocks.settings,
  ipcSettingUpdate: mocks.update,
  ipcDialogShowOpenDialog: mocks.dialog,
  ipcGameSettingGet: mocks.game,
  ipcGameSettingConfigure: mocks.configure,
  ipcGameSettingInitialize: mocks.detect,
  ipcAppGetPath: mocks.path,
  ipcShellOpenPath: mocks.open,
  ipcAppGetVersion: async () => ({ ok: true, data: '1.0' }),
  ipcUpdaterGetStatus: async () => ({ ok: true, data: { state: 'idle' } }),
  ipcSettingOnChanged: () => () => {},
  ipcUpdaterOnCheckingForUpdate: () => () => {},
  ipcUpdaterOnUpdateAvailable: () => () => {},
  ipcUpdaterOnUpdateNotAvailable: () => () => {},
  ipcUpdaterOnDownloadProgress: () => () => {},
  ipcUpdaterOnUpdateDownloaded: () => () => {},
  ipcUpdaterOnError: () => () => {},
  ipcTelemetryGetStatus: mocks.telemetry,
  ipcTelemetryOnStatus: (listener: (status: TelemetryStatus) => void) => {
    mocks.onTelemetry = listener
    return mocks.stopTelemetry
  },
}))
const snapshot = {
  aiAssistantEnabled: false,
  aiAssistantPort: 17861,
  _schemaVersion: 6,
  downloadDirectory: 'D:\\Downloads',
  displayLanguage: 'zh',
  logLevel: 'info',
  telemetryEnabled: false,
  analyticsEnabled: true,
  officialServicesEnabled: true,
  weeklyMutationCalibrationEnabled: true,
  workshopEnabled: true,
} as SettingSnapshot
const game = {
  gameRoot: 'D:\\Game',
  paths: {
    customizeDataRoot: 'D:\\Game\\SCNexusCustomizeData',
    ccmRoot: 'D:\\Game\\Maps\\CustomCampaigns',
  },
  capabilities: { client: true, editor: true, switcher: true },
} as GameSnapshot
const tabs = defineComponent({
  props: ['items'],
  template:
    '<div><slot name="basic"/><slot name="game"/><slot name="content"/><slot name="logging"/></div>',
})
const card = defineComponent({ template: '<div><slot name="header"/><slot/></div>' })
const field = defineComponent({ props: ['label'], template: '<label>{{ label }}<slot/></label>' })
const input = defineComponent({
  props: ['modelValue', 'readonly'],
  template: '<input :value="modelValue" :readonly="readonly" />',
})
const button = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
})
const select = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template:
    '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option>{{ modelValue }}</option></select>',
})
const wrappers: { unmount: () => void }[] = []
beforeEach(() => {
  vi.stubGlobal('scnexus', {})
  mocks.settings.mockResolvedValue({ ok: true, data: snapshot })
  mocks.telemetry.mockResolvedValue({ ok: true, data: { savedEnabled: false, state: 'disabled' } })
  mocks.game.mockResolvedValue({ ok: true, data: game })
  mocks.configure.mockResolvedValue({ ok: true, data: game })
  mocks.detect.mockResolvedValue({ ok: true, data: game })
  mocks.path.mockResolvedValue({ ok: true, data: 'D:\\Logs' })
  mocks.open.mockResolvedValue({ ok: true, data: '' })
  mocks.update.mockImplementation(async (patch) => ({ ok: true, data: { ...snapshot, ...patch } }))
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})
async function render() {
  const wrapper = mount(SettingsView, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          flatJson: true,
          locale: 'zh',
          messages: { zh },
        }) as unknown as Plugin,
      ],
      stubs: {
        Tabs: tabs,
        Card: card,
        FormField: field,
        Input: input,
        Button: button,
        Select: select,
        Switch: true,
        Badge: true,
        Progress: true,
        Alert: true,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
function namedButton(wrapper: Awaited<ReturnType<typeof render>>, name: string) {
  return wrapper.findAll('button').find((item) => item.text() === name)!
}

test('directory change persists immediately, shows a toast and has no editable path or save button', async () => {
  mocks.dialog.mockResolvedValue({
    ok: true,
    data: { canceled: false, filePaths: ['D:\\NewDownloads'] },
  })
  const wrapper = await render()
  expect(wrapper.findAll('input').every((item) => item.attributes('readonly') !== undefined)).toBe(
    true,
  )
  expect(wrapper.findAll('button').map((item) => item.text())).not.toContain('保存')
  await namedButton(wrapper, '修改目录').trigger('click')
  await flushPromises()
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ downloadDirectory: 'D:\\NewDownloads' })
  expect(wrapper.findAll('input').map((item) => item.element.value)).toContain('D:\\NewDownloads')
  expect(mocks.toast).toHaveBeenCalledWith({ color: 'success', title: '设置已保存' })
  expect(
    wrapper.findAllComponents({ name: 'Alert' }).map((item) => item.props('color')),
  ).not.toContain('success')
})
test('shows real telemetry failure despite saved consent and unsubscribes on unmount', async () => {
  mocks.settings.mockResolvedValueOnce({ ok: true, data: { ...snapshot, telemetryEnabled: true } })
  mocks.telemetry.mockResolvedValueOnce({ ok: true, data: { savedEnabled: true, state: 'failed' } })
  const wrapper = await render()
  expect(wrapper.text()).toContain('运行状态：初始化失败')
  mocks.onTelemetry!({ savedEnabled: false, state: 'disabled' })
  await flushPromises()
  expect(wrapper.text()).toContain('运行状态：已关闭')
  wrapper.unmount()
  expect(mocks.stopTelemetry).toHaveBeenCalledOnce()
})
test('a late initial telemetry query cannot replace a newer status event', async () => {
  let resolve!: (value: IpcResult<TelemetryStatus>) => void
  mocks.telemetry.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const wrapper = await render()
  mocks.onTelemetry!({ savedEnabled: false, state: 'disabled' })
  resolve({ ok: true, data: { savedEnabled: true, state: 'enabled' } })
  await flushPromises()
  expect(wrapper.text()).toContain('运行状态：已关闭')
  expect(wrapper.text()).not.toContain('运行状态：错误上报已启用')
})

test('cancelling directory selection does not save or show success', async () => {
  mocks.dialog.mockResolvedValue({ ok: true, data: { canceled: true, filePaths: [] } })
  const wrapper = await render()
  await namedButton(wrapper, '修改目录').trigger('click')
  await flushPromises()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.toast).not.toHaveBeenCalled()
})

test('opening each directory uses the exact existing path and reads the logs path from main', async () => {
  const wrapper = await render()
  expect(mocks.path).toHaveBeenCalledExactlyOnceWith('logs')
  const buttons = wrapper.findAll('button').filter((item) => item.text() === '打开目录')
  expect(buttons).toHaveLength(5)
  for (const item of buttons) {
    await item.trigger('click')
    await flushPromises()
  }
  expect(mocks.open.mock.calls.map(([path]) => path)).toEqual([
    snapshot.downloadDirectory,
    game.gameRoot,
    game.paths!.customizeDataRoot,
    game.paths!.ccmRoot,
    'D:\\Logs',
  ])
  expect(mocks.toast).not.toHaveBeenCalled()
})

test('an Electron openPath error string is shown as an error toast instead of success', async () => {
  mocks.open.mockResolvedValue({ ok: true, data: 'Directory does not exist' })
  const wrapper = await render()
  await wrapper
    .findAll('button')
    .find((item) => item.attributes('aria-label') === '打开目录 · 下载目录')!
    .trigger('click')
  await flushPromises()
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({
      color: 'error',
      title: '操作失败 · M024',
      description: expect.stringContaining('Directory does not exist'),
    }),
  )
})

test('failed directory updates keep the displayed persisted path and report failure', async () => {
  mocks.dialog.mockResolvedValue({
    ok: true,
    data: { canceled: false, filePaths: ['D:\\Rejected'] },
  })
  const error = toErrorDto(new AppError(ERRORS.STORE_WRITE_FAILED))
  mocks.update.mockResolvedValue({ ok: false, error })
  const wrapper = await render()
  await namedButton(wrapper, '修改目录').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('input').map((item) => item.element.value)).toContain(
    snapshot.downloadDirectory,
  )
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({
      color: 'error',
      description: expect.stringContaining(error.errorId),
    }),
  )
  expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
})

test('language preference save displays toast and preserves resync after rejection', async () => {
  const wrapper = await render()
  const control = wrapper.findAllComponents(select)[0]!
  control.vm.$emit('update:modelValue', 'en')
  await flushPromises()
  expect(mocks.update).toHaveBeenCalledWith({ displayLanguage: 'en' })
  expect(mocks.toast).toHaveBeenCalledWith({ color: 'success', title: '设置已保存' })
  mocks.toast.mockClear()
  mocks.update.mockResolvedValue({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.STORE_WRITE_FAILED)),
  })
  control.vm.$emit('update:modelValue', 'zh-Hant')
  await flushPromises()
  expect(mocks.settings).toHaveBeenCalledTimes(2)
  expect(control.props('modelValue')).toBe('zh')
  expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
})

test('missing paths or desktop bridge disable directory opening', async () => {
  mocks.path.mockResolvedValue({ ok: true, data: '' })
  mocks.game.mockResolvedValue({ ok: true, data: { ...game, gameRoot: null, paths: null } })
  const wrapper = await render()
  expect(
    wrapper
      .findAll('button')
      .filter((item) => item.text() === '打开目录' && item.attributes('disabled') !== undefined),
  ).toHaveLength(4)
  wrapper.unmount()
  vi.stubGlobal('scnexus', undefined)
  const outside = await render()
  expect(
    outside
      .findAll('button')
      .filter((item) => item.text() === '打开目录')
      .every((item) => item.attributes('disabled') !== undefined),
  ).toBe(true)
})

test('log directory read failure is reported and its open button stays disabled', async () => {
  const error = toErrorDto(new AppError(ERRORS.FILESYSTEM_PERMISSION_DENIED))
  mocks.path.mockResolvedValue({ ok: false, error })
  const wrapper = await render()
  const openLogs = wrapper
    .findAll('button')
    .find((item) => item.attributes('aria-label') === '打开目录 · 日志目录')!
  expect(openLogs.attributes('disabled')).toBeDefined()
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({
      color: 'error',
      description: expect.stringContaining(error.errorId),
    }),
  )
})

test('game directory change and log-level changes also notify success via toast', async () => {
  mocks.dialog.mockResolvedValue({ ok: true, data: { canceled: false, filePaths: ['D:\\Game'] } })
  const wrapper = await render()
  await namedButton(wrapper, '选择目录').trigger('click')
  await flushPromises()
  expect(mocks.configure).toHaveBeenCalledWith('D:\\Game')
  expect(mocks.toast).toHaveBeenCalledWith({ color: 'success', title: '设置已保存' })
  mocks.toast.mockClear()
  const levels = wrapper.findAllComponents(select)[1]!
  levels.vm.$emit('update:modelValue', 'debug')
  await flushPromises()
  expect(mocks.update).toHaveBeenCalledWith({ logLevel: 'debug' })
  expect(mocks.toast).toHaveBeenCalledWith({ color: 'success', title: '设置已保存' })
})

test('online analytics appears in privacy settings with persisted default and updates independently', async () => {
  const wrapper = await render()
  expect(wrapper.text()).toContain('在线分析')
  const switches = wrapper.findAllComponents({ name: 'Switch' })
  const control = switches.find((item) =>
    item.element.closest('label')?.textContent?.includes('在线分析'),
  )
  expect(control).toBeDefined()
  control!.vm.$emit('update:modelValue', false)
  await flushPromises()
  expect(mocks.update).toHaveBeenCalledWith({ analyticsEnabled: false })
})

test('official service master disables subcontrols while preserving saved preferences', async () => {
  const wrapper = await render()
  const switchByLabel = (label: string) =>
    wrapper
      .findAllComponents({ name: 'Switch' })
      .find((item) => item.attributes('label') === label)!
  expect(wrapper.findComponent(tabs).props('items')).toEqual(
    expect.arrayContaining([expect.objectContaining({ label: '功能管理', value: 'content' })]),
  )
  expect(wrapper.findAll('h2').map((heading) => heading.text())).toContain('星际枢纽官方服务')
  const labels = wrapper
    .findAllComponents({ name: 'Switch' })
    .map((item) => item.attributes('label'))
  expect(labels.indexOf('创意工坊')).toBeLessThan(labels.indexOf('每周突变在线校准'))
  const master = switchByLabel('星际枢纽官方服务')
  const weekly = switchByLabel('每周突变在线校准')
  const workshop = switchByLabel('创意工坊')
  expect(master).toBeDefined()
  expect(weekly.attributes('modelvalue')).toBe('true')
  master.vm.$emit('update:modelValue', false)
  await flushPromises()
  expect(mocks.update).toHaveBeenLastCalledWith({ officialServicesEnabled: false })
  expect(weekly.attributes('disabled')).toBe('true')
  expect(workshop.attributes('disabled')).toBe('true')
  expect(weekly.attributes('modelvalue')).toBe('true')
  expect(workshop.attributes('modelvalue')).toBe('true')
  master.vm.$emit('update:modelValue', true)
  await flushPromises()
  expect(weekly.attributes('disabled')).toBe('false')
  weekly.vm.$emit('update:modelValue', false)
  await flushPromises()
  expect(mocks.update).toHaveBeenLastCalledWith({ weeklyMutationCalibrationEnabled: false })
})

test('local AI switch is default-off and independent of official services', async () => {
  mocks.settings.mockResolvedValue({
    ok: true,
    data: { ...snapshot, officialServicesEnabled: false },
  })
  const wrapper = await render()
  const control = wrapper
    .findAllComponents({ name: 'Switch' })
    .find((item) => item.attributes('label') === '智能助手')!
  expect(control.attributes('modelvalue')).toBe('false')
  expect(control.attributes('disabled')).toBe('false')
  control.vm.$emit('update:modelValue', true)
  await flushPromises()
  expect(mocks.update).toHaveBeenLastCalledWith({ aiAssistantEnabled: true })
})
