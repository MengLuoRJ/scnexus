import { test, expect, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  data: {
    logLevel: 'error',
    telemetryEnabled: false,
    clientId: 'client',
    displayLanguage: 'zh',
  },
  apply: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(async () => {}),
  send: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getPreferredSystemLanguages: () => ['zh'] },
}))
vi.mock('../../../stores/setting', () => ({
  getSettingStore: () => ({ ...mocks.data }),
  updateSettingStore: (data: typeof mocks.data) => {
    mocks.data = { ...data }
    return { ...data }
  },
}))
vi.mock('../../logging/logging', () => ({
  applyLogLevel: mocks.apply,
  reportError: vi.fn(),
}))
vi.mock('../../telemetry/telemetry', () => ({
  enableTelemetry: mocks.enable,
  disableTelemetry: mocks.disable,
  setSavedTelemetryEnabled: vi.fn(),
}))
vi.mock('../../window/window', () => ({
  getMainWindow: () => ({ webContents: { send: mocks.send } }),
  onWindowReady: vi.fn(),
}))
import { updateSetting } from '../setting'
test('settings compensate log-level failure, serialize later writes and preserve consent revocation despite SDK failure', async () => {
  mocks.apply.mockImplementationOnce(() => {
    throw new Error('transport')
  })
  await expect(updateSetting({ logLevel: 'debug' })).rejects.toMatchObject({
    code: 'M052',
  })
  expect(mocks.data.logLevel).toBe('error')
  expect(mocks.apply).toHaveBeenLastCalledWith('error')
  await updateSetting({ logLevel: 'warn' })
  expect(mocks.data.logLevel).toBe('warn')
  mocks.enable.mockImplementationOnce(() => {
    throw new Error('sdk')
  })
  await expect(updateSetting({ telemetryEnabled: true })).rejects.toThrow()
  expect(mocks.data.telemetryEnabled).toBe(true)
  mocks.disable.mockRejectedValueOnce(new Error('close'))
  await expect(updateSetting({ telemetryEnabled: false })).rejects.toThrow()
  expect(mocks.data.telemetryEnabled).toBe(false)
  expect(mocks.send).toHaveBeenCalled()
})
