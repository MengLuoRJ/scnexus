import { app, net } from 'electron'
import { join } from 'node:path'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
import { settingRepository } from '../stores/setting'
import {
  createAnalyticsService,
  createAnalyticsStorage,
  createAnalyticsTransport,
} from './analytics'
let service: ReturnType<typeof createAnalyticsService> | undefined
let networkTimer: ReturnType<typeof setInterval> | undefined
let online: boolean | undefined
function observeNetwork() {
  try {
    const next = net.isOnline()
    if (next !== online) {
      online = next
      service?.setOnline(next)
    }
  } catch {
    /* OS connectivity observation must remain optional. */
  }
}
export function startAnalytics(snapshot: AuthSnapshot | null): void {
  if (service) return
  try {
    service = createAnalyticsService({
      storage: createAnalyticsStorage(join(app.getPath('userData'), 'analytics')),
      transport: createAnalyticsTransport(),
      getClientId: () => settingRepository.getSnapshot().clientId,
    })
    service.setEnabled(settingRepository.getSnapshot().analyticsEnabled)
    observeNetwork()
    void service.startup(snapshot)
    if (settingRepository.getSnapshot().analyticsEnabled) startNetworkObserver()
  } catch {
    /* Optional analytics must not fail application initialization. */
  }
}
function startNetworkObserver() {
  clearInterval(networkTimer)
  observeNetwork()
  networkTimer = setInterval(observeNetwork, 5000)
  networkTimer.unref?.()
}
export function setAnalyticsEnabled(enabled: boolean): void {
  if (enabled && service) startNetworkObserver()
  else {
    clearInterval(networkTimer)
    networkTimer = undefined
  }
  service?.setEnabled(enabled)
}
export function analyticsAuthenticationChanged(snapshot: AuthSnapshot): void {
  service?.authenticationChanged(snapshot)
}
export function analyticsLogin(snapshot: AuthSnapshot): void {
  void service?.login(snapshot)
}
export function analyticsLogout(): void {
  void service?.logout()
}
export function disposeAnalytics(): void {
  clearInterval(networkTimer)
  networkTimer = undefined
  service?.dispose()
  service = undefined
  online = undefined
}
