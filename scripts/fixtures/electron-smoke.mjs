import assert from 'node:assert/strict'
import { join, resolve, sep } from 'node:path'
import { app, BrowserWindow, ipcMain, safeStorage, session } from 'electron'

const fixtureRoot = import.meta.dirname

const scratch = process.argv[2]
assert.ok(scratch && resolve(scratch).startsWith(resolve(fixtureRoot, '../..') + sep))
app.setPath('userData', join(scratch, 'userData'))
app.setPath('sessionData', join(scratch, 'sessionData'))
app.setPath('logs', join(scratch, 'logs'))
app.setPath('crashDumps', join(scratch, 'crashes'))
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch('disable-domain-reliability')
app.commandLine.appendSwitch('no-proxy-server')
app.commandLine.appendSwitch('disable-features', 'OptimizationHints,MediaRouter')
app.on('window-all-closed', () => {})

async function run() {
  assert.match(process.versions.electron, /^45\./)
  await app.whenReady()
  const isolated = session.fromPartition('electron45-smoke')
  isolated.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: /^(https?|wss?):/.test(details.url) })
  })
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  assert.equal(await safeStorage.isAsyncEncryptionAvailable(), true)
  const plaintext = 'isolated Electron compatibility fixture'
  const encrypted = await safeStorage.encryptStringAsync(plaintext)
  assert.equal((await safeStorage.decryptStringAsync(encrypted)).result, plaintext)
  // Only this fixture uses the legacy API to verify existing on-disk ciphertext compatibility.
  const legacy = safeStorage.encryptString(plaintext)
  assert.equal((await safeStorage.decryptStringAsync(legacy)).result, plaintext)

  let preloadFailure
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: resolve(fixtureRoot, '../../packages/app-preload/dist/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      session: isolated,
    },
  })
  window.webContents.on('preload-error', (_event, _path, error) => {
    preloadFailure = error
  })
  ipcMain.handle('app:get-version-v2', (event) => {
    assert.equal(event.sender, window.webContents)
    return { ok: true, data: process.versions.electron }
  })
  await window.loadURL(
    'data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src %27none%27"><title>Isolated preload smoke</title>',
  )
  if (preloadFailure) throw preloadFailure
  const result = await window.webContents.executeJavaScript(`(async () => ({
    version: await window.scnexus.app.getVersion(),
    webUtils: typeof window.webUtils.getPathForFile,
    sentryBridge: typeof window.__SENTRY_IPC__?.['sentry-ipc']?.sendEnvelope,
    isolated: typeof require === 'undefined' && typeof process === 'undefined'
  }))()`)
  assert.deepEqual(result.version, { ok: true, data: process.versions.electron })
  assert.equal(result.webUtils, 'function')
  assert.equal(result.sentryBridge, 'function')
  const envelope = new Promise((resolve) => {
    ipcMain.once('sentry-ipc.envelope', (event, body) => {
      assert.equal(event.sender, window.webContents)
      resolve(body)
    })
  })
  await window.webContents.executeJavaScript(
    `window.__SENTRY_IPC__['sentry-ipc'].sendEnvelope('synthetic-smoke-envelope')`,
  )
  assert.equal(await envelope, 'synthetic-smoke-envelope')
  assert.equal(result.isolated, true)
  assert.equal(window.webContents.getLastWebPreferences().sandbox, true)
  window.destroy()
  console.log(
    'ELECTRON_SMOKE_OK',
    JSON.stringify({
      versions: process.versions,
      sandbox: true,
      bridge: true,
      asyncEncryption: true,
      legacyDecryption: true,
    }),
  )
}
run()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
