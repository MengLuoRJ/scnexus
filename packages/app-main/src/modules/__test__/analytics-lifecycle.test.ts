import { expect, test, vi, afterEach, beforeEach } from 'vitest'
const mocks = vi.hoisted(() => ({
  online: true,
  enabled: true,
  officialServicesEnabled: true,
  setEnabled: vi.fn<(enabled: boolean) => void>(),
  setOnline: vi.fn<(online: boolean) => void>(),
  authenticationChanged: vi.fn<(snapshot: unknown) => void>(),
  startup: vi.fn<() => Promise<void>>(async () => {}),
  login: vi.fn<() => Promise<void>>(async () => {}),
  logout: vi.fn<() => Promise<void>>(async () => {}),
  leave: vi.fn<(snapshot: unknown) => Promise<void>>(async () => {}),
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
  settingRepository: {
    getSnapshot: () => ({
      clientId: 'id',
      analyticsEnabled: mocks.enabled,
      officialServicesEnabled: mocks.officialServicesEnabled,
    }),
  },
}))
vi.mock('../analytics', () => ({
  createAnalyticsStorage: () => ({}),
  createAnalyticsTransport: () => ({}),
  createAnalyticsService: () => mocks,
}))
import {
  startAnalytics,
  analyticsLogin,
  analyticsAuthenticationChanged,
  analyticsLogout,
  analyticsLeave,
  disposeAnalytics,
  setAnalyticsEnabled,
} from '../analytics-lifecycle'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
beforeEach(() => {
  vi.useFakeTimers()
  mocks.online = true
  mocks.enabled = true
  mocks.officialServicesEnabled = true
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

test('leave forwards the captured snapshot only when the statistics service exists', async () => {
  const snapshot = { status: 'signed-in' } as AuthSnapshot
  await analyticsLeave(snapshot)
  expect(mocks.leave).not.toHaveBeenCalled()
  startAnalytics(snapshot)
  await analyticsLeave(snapshot)
  expect(mocks.leave).toHaveBeenCalledWith(snapshot)
})
test('official services disabled retains anonymous analytics under its independent consent', () => {
  mocks.officialServicesEnabled = false
  const signedIn = { status: 'signed-in' } as AuthSnapshot
  startAnalytics(signedIn)
  expect(mocks.startup).toHaveBeenCalledWith(null)
  expect(mocks.setEnabled).toHaveBeenLastCalledWith(true)
  expect(vi.getTimerCount()).toBe(1)
  analyticsAuthenticationChanged(signedIn)
  analyticsLogin(signedIn)
  expect(mocks.logout).toHaveBeenCalledTimes(2)
  expect(mocks.login).not.toHaveBeenCalled()
  expect(mocks.authenticationChanged).not.toHaveBeenCalled()
  setAnalyticsEnabled(false)
  expect(mocks.setEnabled).toHaveBeenLastCalledWith(false)
  expect(vi.getTimerCount()).toBe(0)
  mocks.officialServicesEnabled = true
  setAnalyticsEnabled(false)
  expect(mocks.setEnabled).toHaveBeenLastCalledWith(false)
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
