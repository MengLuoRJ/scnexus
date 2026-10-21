import { initAllStores, initContentStores } from '../stores'
import { settingRepository } from '../stores/setting'
import { onGameConfigured } from './scii-game-setting'
import { initAppModule } from './app'
import { initAuthModule, disposeAuth } from './auth'
import { initWindowModule, onWindowReady } from './window'
import { initDialogModule } from './dialog'
import { initShellModule } from './shell'
import { initDeepLinkModule } from './deep-link'
import { initTrayModule, destroyTray } from './tray'
import { setBeforeUpdateInstall } from './updater'
import { initUpdaterModule } from './updater'
import { initSettingModule, disposeSetting } from './setting'
import { initTelemetryModule, disableTelemetry, getTelemetryStatus } from './telemetry'
import { initSciiGameSettingModule } from './scii-game-setting'
import { initContentPackageModule } from './content-package'
import { initCampaignModule } from './campaign'
import { initCustomizeModule } from './customize'
import { initWorkshopModule } from './workshop'
import { getMainWindow } from './window'
import { reportError } from './logging'

const cleanup: (() => void)[] = []
export async function initModules() {
  setBeforeUpdateInstall(disposeModules)
  let contentStarted = false
  onGameConfigured(async () => {
    await initContentStores()
    if (contentStarted) return
    initContentPackageModule()
    initCampaignModule()
    initCustomizeModule()
    contentStarted = true
  })
  const failures = []
  const initializers: [string, () => unknown][] = [
    ['stores', initAllStores],
    ['window', initWindowModule],
    ['telemetry', initTelemetryModule],
    [
      'setting',
      () => {
        if (settingRepository.isInitialized()) initSettingModule()
      },
    ],
    ['app', initAppModule],
    ['auth', initAuthModule],
    ['dialog', initDialogModule],
    ['shell', initShellModule],
    ['deep-link', initDeepLinkModule],
    ['tray', initTrayModule],
    ['updater', initUpdaterModule],
    ['scii-game-setting', initSciiGameSettingModule],
    ['workshop', initWorkshopModule],
  ]
  for (const [scope, initialize] of initializers) {
    try {
      await initialize()
    } catch (error) {
      for (const failure of error instanceof AggregateError ? error.errors : [error])
        failures.push(reportError(failure, scope))
    }
  }
  cleanup.push(
    onWindowReady(() =>
      getMainWindow()?.webContents.send('telemetry:status', getTelemetryStatus()),
    ),
  )
  return failures
}
export async function disposeModules() {
  onGameConfigured(undefined)
  cleanup.splice(0).forEach((dispose) => dispose())
  disposeAuth()
  disposeSetting()
  destroyTray()
  await disableTelemetry().catch((error) => reportError(error, 'telemetry'))
}
