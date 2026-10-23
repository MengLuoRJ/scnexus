import { expect, test, vi, afterEach, beforeEach } from 'vitest'
const mocks = vi.hoisted(() => ({
  online: true,
  enabled: true,
  setEnabled: vi.fn<(enabled: boolean) => void>(),
  setOnline: vi.fn<(online: boolean) => void>(),
  authenticationChanged: vi.fn<(snapshot: unknown) => void>(),
  startup: vi.fn<() => Promise<void>>(async () => {}),
  login: vi.fn<() => Promise<void>>(async () => {}),
  logout: vi.fn<() => Promise<void>>(async () => {}),
  dispose: vi.fn<() => void>(),
}))
vi.mock('../../utils/application-data', () => ({
  getApplicationDataDirectory: () => 'test-application-data',
}))
vi.mock('electron', () => ({
  app: { getPath: () => 'test-user-data' },
  net: { isOnline: () => mocks.online },
}))
vi.mock('../../stores/setting', () => ({
  settingRepository: { getSnapshot: () => ({ clientId: 'id', analyticsEnabled: mocks.enabled }) },
}))
vi.mock('../analytics', () => ({
  createAnalyticsStorage: () => ({}),
  createAnalyticsTransport: () => ({}),
  createAnalyticsService: () => mocks,
}))
import {
  startAnalytics,
  analyticsLogin,
  analyticsLogout,
  disposeAnalytics,
  setAnalyticsEnabled,
} from '../analytics-lifecycle'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
beforeEach(() => {
  vi.useFakeTimers()
  mocks.online = true
  mocks.enabled = true
})
afterEach(() => {
  disposeAnalytics()
  vi.clearAllMocks()
  vi.useRealTimers()
})
test('lifecycle wrapper starts once and never waits for optional statistics', () => {
  startAnalytics(null)
  startAnalytics(null)
  analyticsLogin({ status: 'signed-in' } as AuthSnapshot)
  analyticsLogout()
  expect(mocks.startup).toHaveBeenCalledOnce()
  expect(mocks.login).toHaveBeenCalledOnce()
  expect(mocks.logout).toHaveBeenCalledOnce()
})

test('offline observation sends only network state changes and stops when disabled', async () => {
  startAnalytics(null)
  expect(mocks.setOnline).toHaveBeenLastCalledWith(true)
  mocks.online = false
  await vi.advanceTimersByTimeAsync(5000)
  expect(mocks.setOnline).toHaveBeenLastCalledWith(false)
  await vi.advanceTimersByTimeAsync(20000)
  expect(mocks.setOnline).toHaveBeenCalledTimes(2)
  mocks.online = true
  await vi.advanceTimersByTimeAsync(5000)
  expect(mocks.setOnline).toHaveBeenLastCalledWith(true)
  setAnalyticsEnabled(false)
  mocks.online = false
  await vi.advanceTimersByTimeAsync(20000)
  expect(mocks.setOnline).toHaveBeenCalledTimes(3)
  expect(mocks.setEnabled).toHaveBeenLastCalledWith(false)
})
