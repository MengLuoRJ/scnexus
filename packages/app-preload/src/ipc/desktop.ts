import { contextBridge, ipcRenderer } from 'electron'
import { workshopApi } from './workshop.js'
import { invoke, subscribeTyped } from '../ipc-common.js'
import type { DesktopApi, LogInput } from '@scnexus/app-shared/types/desktop.type'

function contentApi(
  domain: 'campaign' | 'customize' | 'dependency',
): import('@scnexus/app-shared/types/content-api.type').ContentApi {
  return {
    cancel: (id) => invoke('content-package:cancel', id),
    analyze: (input) => invoke(`${domain}:analyze`, input),
    install: (selection) => invoke(`${domain}:install`, selection),
    list: () => invoke(`${domain}:list`),
    scan: () => invoke(`${domain}:scan`),
    prepareUninstall: (id) => invoke(`${domain}:prepare-uninstall`, id),
    uninstall: (id, decisions) => invoke(`${domain}:uninstall`, id, decisions),
  }
}
const api: DesktopApi = {
  replay: {
    chooseExportPath: () => invoke('replay:choose-export-path'),
    analyze: (replayId) => invoke('replay:analyze', replayId),
    getAnalysis: (replayId) => invoke('replay:get-analysis', replayId),
    discoverDirectories: () => invoke('replay:discover-directories'),
    listDuplicates: () => invoke('replay:duplicates'),
    exportArchive: (ids, destination) => invoke('replay:export-archive', ids, destination),
    list: () => invoke('replay:list'),
    scanDirectory: (rootDir) => invoke('replay:scan-directory', rootDir),
    indexFile: (filePath) => invoke('replay:index-file', filePath),
    importArchive: (archivePath, destinationDir) =>
      invoke('replay:import-archive', archivePath, destinationDir),
    delete: (filePath) => invoke('replay:delete', filePath),
  },
  aiAssistant: {
    getStatus: () => invoke('ai-assistant:getStatus'),
    start: (port) => invoke('ai-assistant:start', port),
    stop: () => invoke('ai-assistant:stop'),
    regenerateToken: () => invoke('ai-assistant:regenerateToken'),
    getConnectionInfo: () => invoke('ai-assistant:getConnectionInfo'),
    listRecords: () => invoke('ai-assistant:listRecords'),
    clearRecords: () => invoke('ai-assistant:clearRecords'),
    onStatusChanged: (listener) => subscribeTyped('ai-assistant:statusChanged', listener),
    onRecordChanged: (listener) => subscribeTyped('ai-assistant:recordChanged', listener),
  },
  workshop: workshopApi,
  dependency: contentApi('dependency'),
  auth: {
    getSnapshot: () => invoke('auth:getSnapshot'),
    login: (input) => invoke('auth:login', input),
    register: (input) => invoke('auth:register', input),
    completeMfa: (input) => invoke('auth:completeMfa', input),
    requestChallenge: (input) => invoke('auth:requestChallenge', input),
    resetPassword: (input) => invoke('auth:resetPassword', input),
    refresh: () => invoke('auth:refresh'),
    logout: () => invoke('auth:logout'),
    onChanged: (listener) => subscribeTyped('auth:changed', listener),
  },
  content: {
    assets: (localId) => invoke('content-package:assets', localId),
    asset: (localId, path) => invoke('content-package:asset', localId, path),
    analyze: (input, choice) => invoke('content-package:analyze', input, choice),
  },
  customize: {
    launch: (id) => invoke('customize:launch', id),
    ...contentApi('customize'),
    setLauncher: (id, target) => invoke('customize:set-launcher', id, target),
    onInstallProgress: (listener) => subscribeTyped('customize:install-progress', listener),
  },
  campaign: {
    onInstallProgress: (listener) => subscribeTyped('campaign:install-progress', listener),
    launch: () => invoke('campaign:launch'),
    ...contentApi('campaign'),
    prepareActivation: (id) => invoke('campaign:prepare-activation', id),
    activate: (id, decisions) => invoke('campaign:activate', id, decisions),
    active: () => invoke('campaign:active'),
    prepareDeactivation: (id) => invoke('campaign:prepare-deactivation', id),
    deactivate: (id, decisions) => invoke('campaign:deactivate', id, decisions),
  },
  gameSetting: {
    initialize: (path?: string) => invoke('scii-game-setting:initialize', path),
    get: () => invoke('scii-game-setting:get'),
    configure: (path) => invoke('scii-game-setting:configure', path),
    refresh: () => invoke('scii-game-setting:refresh'),
  },
  app: {
    getVersion: () => invoke('app:get-version-v2'),
    getDeviceName: () => invoke('app:get-device-name'),
  },
  window: {
    getStatus: () => invoke('window:get-status'),
    show: () => invoke('window:show'),
    minimize: () => invoke('window:minimize'),
    setMaximized: (value) => invoke('window:set-maximized', value),
    close: () => invoke('window:close'),
    ready: () => invoke('window:ready'),
    onStatus: (listener) => subscribeTyped('window:status', listener),
  },
  setting: {
    getSnapshot: () => invoke('setting:get-snapshot'),
    getKey: (key) => invoke('setting:get-key', key),
    updateKey: (key, value) => invoke('setting:update-key', key, value),
    update: (patch) => invoke('setting:update', patch),
    replace: (data) => invoke('setting:replace', data),
    onChanged: (listener) => subscribeTyped('setting:changed', listener),
  },
  logging: {
    getConfig: () => invoke('logging:get-config'),
    setLevel: (level) => invoke('logging:set-level', level),
    write: (input: LogInput) => ipcRenderer.send('logging:write', input, 'renderer'),
  },
  telemetry: {
    getStatus: () => invoke('telemetry:get-status'),
    setEnabled: (enabled) => invoke('telemetry:set-enabled', enabled),
    onStatus: (listener) => subscribeTyped('telemetry:status', listener),
  },
  deepLink: {
    onAuthentication: (listener) => subscribeTyped('deeplink:authentication', listener),
    onWorkshop: (listener) => subscribeTyped('deeplink:workshop', listener),
  },
}
contextBridge.exposeInMainWorld('scnexus', api)
