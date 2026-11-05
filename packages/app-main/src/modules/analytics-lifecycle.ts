import { net } from 'electron'
import { getApplicationDataDirectory } from '../utils/application-data'
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
      storage: createAnalyticsStorage(join(getApplicationDataDirectory(), 'analytics')),
      transport: createAnalyticsTransport(),
      getClientId: () => settingRepository.getSnapshot().clientId,
    })
    const settings = settingRepository.getSnapshot()
    const enabled = settings.analyticsEnabled
    service.setEnabled(enabled)
    observeNetwork()
    void service.startup(settings.officialServicesEnabled === false ? null : snapshot)
    if (enabled) startNetworkObserver()
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
  if (settingRepository.getSnapshot().officialServicesEnabled === false) void service?.logout()
  else service?.authenticationChanged(snapshot)
}
export function analyticsLogin(snapshot: AuthSnapshot): void {
  if (settingRepository.getSnapshot().officialServicesEnabled === false) void service?.logout()
  else void service?.login(snapshot)
}
export async function analyticsLeave(snapshot: AuthSnapshot): Promise<void> {
  await service?.leave(snapshot)
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
