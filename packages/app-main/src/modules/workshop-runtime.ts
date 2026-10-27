import { dialog, app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { initWorkshopModule } from './workshop'
import { getAuthSnapshot, refreshAuthSession } from './auth'
import { settingRepository } from '../stores/setting'
import { getApplicationDataDirectory } from '../utils/application-data'
import { resolveServerApiBase } from '@scnexus/app-shared/config/server'
import { onWorkshopEnabled, onWorkshopAuthenticationChanged } from './workshop-lifecycle'
import { assertIpcSource } from '../utils/ipc-source'
import type { IpcMainInvokeEvent } from 'electron'
let service: Awaited<ReturnType<typeof initWorkshopModule>> | undefined
export async function startWorkshop() {
  if (service) return
  service = await initWorkshopModule({
    apiOrigin: resolveServerApiBase(!app.isPackaged),
    workshopOrigin: process.env.SCNEXUS_WORKSHOP_ORIGIN ?? '',
    filesOrigin: process.env.SCNEXUS_FILES_ORIGIN ?? '',
    root: join(getApplicationDataDirectory(), 'workshop'),
    getSnapshot: getAuthSnapshot,
    refresh: refreshAuthSession,
    enabled: () => settingRepository.getSnapshot().workshopEnabled,
    onEnabledChanged(listener) {
      onWorkshopEnabled(listener)
      return () => onWorkshopEnabled(undefined)
    },
    emit(task) {
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed() || window.webContents.isDestroyed()) continue
        try {
          assertIpcSource({
            sender: window.webContents,
            senderFrame: window.webContents.mainFrame,
          } as IpcMainInvokeEvent)
          window.webContents.send('workshop:changed', task)
        } catch {
          /* Only trusted windows receive transfer state. */
        }
      }
    },
    async selectFile(kind) {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters:
          kind === 'package'
            ? [{ name: 'Workshop package', extensions: ['zip', '7z', 'rar'] }]
            : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
  })
  onWorkshopAuthenticationChanged(() => {
    void service?.authenticationChanged().catch(() => {})
  })
}
export async function stopWorkshop() {
  onWorkshopAuthenticationChanged(undefined)
  await service?.dispose()
  service = undefined
}
export function pauseWorkshopForAuthenticationChange() {
  void service?.authenticationChanged().catch(() => {})
}
