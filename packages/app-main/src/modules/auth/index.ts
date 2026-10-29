import { notifyWorkshopAuthenticationChanged } from '../workshop-lifecycle'
import { BrowserWindow, safeStorage, type IpcMainInvokeEvent } from 'electron'
import { getApplicationDataDirectory } from '../../utils/application-data'
import { join } from 'node:path'
import { settingRepository } from '../../stores/setting'
import { ipcHandleRegister, ipcHandleRemove } from '../../utils/ipc-util'
import { assertIpcSource } from '../../utils/ipc-source'
import { createAuthStorage } from './storage'
import { createAuthTransport } from './transport'
import { createAuthService, type AuthService } from './service'
import { invalid } from './validation'
import {
  analyticsAuthenticationChanged,
  startAnalytics,
  analyticsLogin,
  analyticsLogout,
  disposeAnalytics,
} from '../analytics-lifecycle'

export { createAuthService } from './service'
export { createAuthStorage } from './storage'
export { createAuthTransport } from './transport'
let service: AuthService | undefined
let workshopIdentity = ''
const methods = [
  'getSnapshot',
  'login',
  'register',
  'completeMfa',
  'requestChallenge',
  'resetPassword',
  'refresh',
  'logout',
] as const

/** Called after app ready and single-instance acquisition. Account auth never gates local game services. */
export function initAuthModule(): void {
  if (service) return
  const instance = createAuthService({
    storage: createAuthStorage(join(getApplicationDataDirectory(), 'auth'), safeStorage),
    transport: createAuthTransport(),
    getClientId: () => settingRepository.getSnapshot().clientId,
    changed(snapshot) {
      const identity = `${snapshot.epoch}:${snapshot.sessionId ?? ''}`
      if (identity !== workshopIdentity) {
        workshopIdentity = identity
        notifyWorkshopAuthenticationChanged()
      }
      analyticsAuthenticationChanged(snapshot)
      for (const window of BrowserWindow.getAllWindows()) {
        try {
          if (window.isDestroyed() || window.webContents.isDestroyed()) continue
          assertIpcSource({
            sender: window.webContents,
            senderFrame: window.webContents.mainFrame,
          } as IpcMainInvokeEvent)
          window.webContents.send('auth:changed', snapshot)
        } catch {
          /* Re-check trust on each publication, including after navigation. */
        }
      }
    },
  })
  service = instance
  instance.setEnabled(settingRepository.getSnapshot().officialServicesEnabled !== false)
  for (const method of methods) {
    ipcHandleRegister(`auth:${method}`, async (...args: unknown[]) => {
      const takesInput = !['getSnapshot', 'refresh', 'logout'].includes(method)
      if (args.length !== (takesInput ? 1 : 0)) invalid()
      switch (method) {
        case 'login': {
          const result = await instance.login(args[0])
          if (result.status === 'signed-in') analyticsLogin(result)
          return result
        }
        case 'register': {
          const result = await instance.register(args[0])
          analyticsLogin(result)
          return result
        }
        case 'completeMfa': {
          const result = await instance.completeMfa(args[0])
          analyticsLogin(result)
          return result
        }
        case 'requestChallenge':
          return instance.requestChallenge(args[0])
        case 'resetPassword':
          return instance.resetPassword(args[0])
        case 'getSnapshot':
          return instance.getSnapshot()
        case 'refresh':
          return instance.refresh()
        case 'logout': {
          const wasSignedIn = ['signed-in', 'refreshing'].includes(instance.getSnapshot().status)
          const result = await instance.logout()
          if (wasSignedIn) analyticsLogout()
          return result
        }
      }
    })
  }
  void instance.start().finally(() => {
    if (service === instance) {
      try {
        startAnalytics(instance.getSnapshot())
      } catch {
        startAnalytics(null)
      }
    }
  })
}
export function setOfficialServicesEnabled(enabled: boolean): void {
  service?.setEnabled(enabled)
}
export function getAuthSnapshot() {
  if (!service) throw new Error('Authentication not initialized')
  return service.getSnapshot()
}
export async function refreshAuthSession() {
  if (!service) throw new Error('Authentication not initialized')
  return service.refresh()
}
export function disposeAuth(): void {
  disposeAnalytics()
  service?.dispose()
  service = undefined
  for (const method of methods) ipcHandleRemove(`auth:${method}`)
}
