import { registerApplicationScheme, installApplicationProtocol } from './modules/window/protocol'
import { isInstallingUpdate } from './modules/updater'
import { app, dialog } from 'electron'
import { initializeApplicationMenu } from './modules/app/menu'
import { initLoggingModule, reportError } from './modules/logging'
import { initModules, disposeModules } from './modules/init'
import { captureDeepLink } from './modules/deep-link'
import { restoreOrCreateWindow } from './modules/window'
import { flushTelemetry } from './modules/telemetry'

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

registerApplicationScheme()
initLoggingModule()

let terminating = false
function terminate(error: unknown, scope: string) {
  if (terminating) return
  terminating = true
  try {
    reportError(error, scope)
  } finally {
    void flushTelemetry().finally(() => app.exit(1))
  }
}
process.on('uncaughtException', (error) => terminate(error, 'uncaught-exception'))
process.on('unhandledRejection', (error) => terminate(error, 'unhandled-rejection'))

function receiveDeepLink(url: string) {
  try {
    captureDeepLink(url)
  } catch (error) {
    reportError(error, 'deep-link')
  }
}

if (process.platform === 'win32') app.setAppUserModelId(app.getName())
for (const argument of process.argv) {
  if (argument.startsWith('scnexus://')) receiveDeepLink(argument)
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  receiveDeepLink(url)
})

app.on('second-instance', (_event, args) => {
  for (const argument of args) if (argument.startsWith('scnexus://')) receiveDeepLink(argument)
  void app
    .whenReady()
    .then(restoreOrCreateWindow)
    .catch((error) => reportError(error, 'window'))
})

app.on('activate', () => {
  void app
    .whenReady()
    .then(restoreOrCreateWindow)
    .catch((error) => reportError(error, 'window'))
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let exiting = false
app.on('before-quit', (event) => {
  if (exiting || isInstallingUpdate()) return
  event.preventDefault()
  exiting = true
  void disposeModules().finally(() => app.quit())
})

void app
  .whenReady()
  .then(async () => {
    installApplicationProtocol()
    initializeApplicationMenu()
    const failures = await initModules()
    await restoreOrCreateWindow()
    if (failures.length)
      dialog.showErrorBox(
        'SCNexus 初始化异常',
        failures
          .map((error) => `${error.code} ${error.name}\nerrorId=${error.errorId}`)
          .join('\n\n'),
      )
  })
  .catch((value) => {
    const error = reportError(value, 'startup')
    dialog.showErrorBox('SCNexus 启动失败', `${error.code} ${error.name}\nerrorId=${error.errorId}`)
    app.quit()
  })
