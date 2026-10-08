import { contextBridge, ipcRenderer } from "electron";
import { invokeTyped, subscribeTyped } from "../ipc-common.js";
import type {
  DesktopApi,
  LogInput,
} from "@scnexus/app-shared/types/desktop.type";

function contentApi(
  domain: "campaign" | "customize",
): import("@scnexus/app-shared/types/content-api.type").ContentApi {
  return {
    cancel: (id) => invokeTyped("content-package:cancel", id),
    analyze: (input) => invokeTyped(`${domain}:analyze`, input),
    install: (selection) => invokeTyped(`${domain}:install`, selection),
    list: () => invokeTyped(`${domain}:list`),
    scan: () => invokeTyped(`${domain}:scan`),
    prepareUninstall: (id) => invokeTyped(`${domain}:prepare-uninstall`, id),
    uninstall: (id, decisions) =>
      invokeTyped(`${domain}:uninstall`, id, decisions),
  };
}
const api: DesktopApi = {
  customize: contentApi("customize"),
  campaign: {
    ...contentApi("campaign"),
    prepareActivation: (id) => invokeTyped("campaign:prepare-activation", id),
    activate: (id, decisions) =>
      invokeTyped("campaign:activate", id, decisions),
    active: () => invokeTyped("campaign:active"),
    prepareDeactivation: (id) =>
      invokeTyped("campaign:prepare-deactivation", id),
    deactivate: (id, decisions) =>
      invokeTyped("campaign:deactivate", id, decisions),
  },
  gameSetting: {
    initialize: (path?: string) =>
      invokeTyped("scii-game-setting:initialize", path),
    get: () => invokeTyped("scii-game-setting:get"),
    configure: (path) => invokeTyped("scii-game-setting:configure", path),
    refresh: () => invokeTyped("scii-game-setting:refresh"),
  },
  app: { getVersion: () => invokeTyped("app:get-version-v2") },
  window: {
    getStatus: () => invokeTyped("window:get-status"),
    show: () => invokeTyped("window:show"),
    minimize: () => invokeTyped("window:minimize"),
    setMaximized: (value) => invokeTyped("window:set-maximized", value),
    close: () => invokeTyped("window:close"),
    ready: () => invokeTyped("window:ready"),
    onStatus: (listener) => subscribeTyped("window:status", listener),
  },
  setting: {
    getSnapshot: () => invokeTyped("setting:get-snapshot"),
    getKey: (key) => invokeTyped("setting:get-key", key),
    updateKey: (key, value) => invokeTyped("setting:update-key", key, value),
    update: (patch) => invokeTyped("setting:update", patch),
    replace: (data) => invokeTyped("setting:replace", data),
    onChanged: (listener) => subscribeTyped("setting:changed", listener),
  },
  logging: {
    getConfig: () => invokeTyped("logging:get-config"),
    setLevel: (level) => invokeTyped("logging:set-level", level),
    write: (input: LogInput) =>
      ipcRenderer.send("logging:write", input, "renderer"),
  },
  telemetry: {
    getStatus: () => invokeTyped("telemetry:get-status"),
    setEnabled: (enabled) => invokeTyped("telemetry:set-enabled", enabled),
    onStatus: (listener) => subscribeTyped("telemetry:status", listener),
  },
  deepLink: {
    onAuthentication: (listener) =>
      subscribeTyped("deeplink:authentication", listener),
    onWorkshop: (listener) => subscribeTyped("deeplink:workshop", listener),
  },
};
contextBridge.exposeInMainWorld("scnexus", api);

// The old renderer has no explicit readiness handshake yet.
const notifyReady = () => {
  setTimeout(() => {
    void api.window.ready();
  }, 0);
};
if (document.readyState === "complete") notifyReady();
else window.addEventListener("load", notifyReady, { once: true });
