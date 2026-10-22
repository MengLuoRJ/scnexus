import { test, expect, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  data: {
    logLevel: 'error',
    telemetryEnabled: false,
    analyticsEnabled: true,
    clientId: 'client',
    displayLanguage: 'zh',
  },
  analytics: vi.fn<(enabled: boolean) => void>(),
  apply: vi.fn<typeof import('../../logging/logging').applyLogLevel>(),
  enable: vi.fn<typeof import('../../telemetry/telemetry').enableTelemetry>(),
  disable: vi.fn<typeof import('../../telemetry/telemetry').disableTelemetry>(async () => {}),
  send: vi.fn<typeof import('../../window/window').sendWhenReady>(),
}))
vi.mock('../../analytics-lifecycle', () => ({ setAnalyticsEnabled: mocks.analytics }))
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
  reportError: vi.fn<typeof import('../../logging/logging').reportError>(),
}))
vi.mock('../../telemetry/telemetry', () => ({
  enableTelemetry: mocks.enable,
  disableTelemetry: mocks.disable,
  setSavedTelemetryEnabled:
    vi.fn<typeof import('../../telemetry/telemetry').setSavedTelemetryEnabled>(),
}))
vi.mock('../../window/window', () => ({
  getMainWindow: () => ({ webContents: { send: mocks.send } }),
  onWindowReady: vi.fn<typeof import('../../window/window').onWindowReady>(),
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
  await expect(updateSetting({ telemetryEnabled: true })).rejects.toThrow('sdk')
  expect(mocks.data.telemetryEnabled).toBe(true)
  mocks.disable.mockRejectedValueOnce(new Error('close'))
  await expect(updateSetting({ telemetryEnabled: false })).rejects.toThrow('close')
  expect(mocks.data.telemetryEnabled).toBe(false)
  expect(mocks.send).toHaveBeenCalled()
})

test('online analytics is persisted and applied immediately, independently from Sentry', async () => {
  await updateSetting({ analyticsEnabled: false })
  expect(mocks.data.analyticsEnabled).toBe(false)
  expect(mocks.analytics).toHaveBeenLastCalledWith(false)
  await updateSetting({ analyticsEnabled: true })
  expect(mocks.data.analyticsEnabled).toBe(true)
  expect(mocks.analytics).toHaveBeenLastCalledWith(true)
})
