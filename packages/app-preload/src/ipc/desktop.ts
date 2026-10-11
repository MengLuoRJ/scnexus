import { contextBridge, ipcRenderer } from 'electron'
import { invoke, subscribeTyped } from '../ipc-common.js'
import type { DesktopApi, LogInput } from '@scnexus/app-shared/types/desktop.type'

function contentApi(
  domain: 'campaign' | 'customize',
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
  customize: {
    ...contentApi('customize'),
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
  app: { getVersion: () => invoke('app:get-version-v2') },
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
