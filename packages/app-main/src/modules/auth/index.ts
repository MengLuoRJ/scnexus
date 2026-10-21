import { app, BrowserWindow, safeStorage, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { settingRepository } from '../../stores/setting'
import { ipcHandleRegister, ipcHandleRemove } from '../../utils/ipc-util'
import { assertIpcSource } from '../../utils/ipc-source'
import { createAuthStorage } from './storage'
import { createAuthTransport } from './transport'
import { createAuthService, type AuthService } from './service'
import { invalid } from './validation'

export { createAuthService } from './service'
export { createAuthStorage } from './storage'
export { createAuthTransport } from './transport'
let service: AuthService | undefined
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
    storage: createAuthStorage(join(app.getPath('userData'), 'auth'), safeStorage),
    transport: createAuthTransport(),
    getClientId: () => settingRepository.getSnapshot().clientId,
    changed(snapshot) {
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
  for (const method of methods) {
    ipcHandleRegister(`auth:${method}`, (...args: unknown[]) => {
      const takesInput = !['getSnapshot', 'refresh', 'logout'].includes(method)
      if (args.length !== (takesInput ? 1 : 0)) invalid()
      switch (method) {
        case 'login':
          return instance.login(args[0])
        case 'register':
          return instance.register(args[0])
        case 'completeMfa':
          return instance.completeMfa(args[0])
        case 'requestChallenge':
          return instance.requestChallenge(args[0])
        case 'resetPassword':
          return instance.resetPassword(args[0])
        case 'getSnapshot':
          return instance.getSnapshot()
        case 'refresh':
          return instance.refresh()
        case 'logout':
          return instance.logout()
      }
    })
  }
  void instance.start()
}
export function disposeAuth(): void {
  service?.dispose()
  service = undefined
  for (const method of methods) ipcHandleRemove(`auth:${method}`)
}
