import { app } from 'electron'
import { initializeApplicationData } from '../utils/application-data'
import { initAllStores, initContentStores } from '../stores'
import { settingRepository } from '../stores/setting'
import { onGameConfigured } from './scii-game-setting'
import { initAppModule } from './app'
import { initAiAssistantModule, disposeAiAssistant } from './ai-assistant'
import { initAuthModule, disposeAuth } from './auth'
import { initWindowModule, onWindowReady } from './window'
import { initDialogModule } from './dialog'
import { initShellModule } from './shell'
import { initDeepLinkModule } from './deep-link'
import { initTrayModule, destroyTray } from './tray'
import { setBeforeUpdateInstall } from './updater'
import { initUpdaterModule } from './updater'
import { initSettingModule, disposeSetting } from './setting'
import {
  initTelemetryModule,
  disableTelemetry,
  flushTelemetry,
  getTelemetryStatus,
} from './telemetry'
import { initSciiGameSettingModule } from './scii-game-setting'
import { initContentPackageModule } from './content-package'
import { initArchiveValidationIpc } from './content-package/validation.ipc'
import { initCampaignModule } from './campaign'
import { initCustomizeModule } from './customize'
import { initReplayModule } from './replay'
import { replayDatabase } from './replay/replay-db'
import { disposeReplayAnalyses } from './replay/replay-analysis-runner'
import { startWorkshop, stopWorkshop } from './workshop-runtime'
import { initDependencyIpc } from './dependency/dependency.ipc'
import { getMainWindow } from './window'
import { reportError } from './logging'

const cleanup: (() => void)[] = []
export async function initModules() {
  initializeApplicationData(app.getPath('home'), app.getPath('userData'))
  setBeforeUpdateInstall(disposeModules)
  let contentStarted = false
  onGameConfigured(async () => {
    await initContentStores()
    if (contentStarted) return
    initContentPackageModule()
    initCampaignModule()
    initCustomizeModule()
    initDependencyIpc()
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
    ['archive-validation', initArchiveValidationIpc],
    ['replay', initReplayModule],
    ['shell', initShellModule],
    ['deep-link', initDeepLinkModule],
    ['tray', initTrayModule],
    ['updater', initUpdaterModule],
    ['scii-game-setting', initSciiGameSettingModule],
    ['workshop', startWorkshop],
    ['ai-assistant', initAiAssistantModule],
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
  await disposeAiAssistant()
  await stopWorkshop()
  disposeReplayAnalyses()
  replayDatabase.close()
  disposeAuth()
  disposeSetting()
  destroyTray()
  await flushTelemetry()
  await disableTelemetry().catch((error) => reportError(error, 'telemetry'))
}
