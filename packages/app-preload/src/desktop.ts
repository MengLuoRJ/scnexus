import { contextBridge, ipcRenderer } from "electron";
import {
  AppError,
  ERRORS,
  isErrorDto,
  toErrorDto,
  type IpcResult,
} from "@scnexus/app-shared/errors/app.error";
import type {
  DesktopApi,
  LogInput,
} from "@scnexus/app-shared/types/desktop.type";

export async function invokeTyped<T>(
  channel: string,
  ...args: unknown[]
): Promise<IpcResult<T>> {
  try {
    const response = await ipcRenderer.invoke(channel, ...args);
    if (response && response.ok === true && Object.hasOwn(response, "data"))
      return response;
    if (response && response.ok === false && isErrorDto(response.error))
      return response;
    return {
      ok: false,
      error: toErrorDto(new AppError(ERRORS.IPC_RESULT_INVALID)),
    };
  } catch {
    const error = toErrorDto(new AppError(ERRORS.IPC_TRANSPORT_FAILED));
    ipcRenderer.send(
      "logging:write",
      {
        level: "error",
        scope: "preload",
        message: "IPC transport failed",
        error,
      },
      "preload",
    );
    return { ok: false, error };
  }
}
function subscribe<T>(channel: string, listener: (data: T) => void) {
  const wrapped = (_event: Electron.IpcRendererEvent, data: T) =>
    listener(data);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}
const api: DesktopApi = {
  app: { getVersion: () => invokeTyped("app:get-version-v2") },
  window: {
    getStatus: () => invokeTyped("window:get-status"),
    show: () => invokeTyped("window:show"),
    minimize: () => invokeTyped("window:minimize"),
    setMaximized: (value) => invokeTyped("window:set-maximized", value),
    close: () => invokeTyped("window:close"),
    ready: () => invokeTyped("window:ready"),
    onStatus: (listener) => subscribe("window:status", listener),
  },
  setting: {
    getSnapshot: () => invokeTyped("setting:get-snapshot"),
    getKey: (key) => invokeTyped("setting:get-key", key),
    updateKey: (key, value) => invokeTyped("setting:update-key", key, value),
    update: (patch) => invokeTyped("setting:update", patch),
    replace: (data) => invokeTyped("setting:replace", data),
    onChanged: (listener) => subscribe("setting:changed", listener),
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
    onStatus: (listener) => subscribe("telemetry:status", listener),
  },
  deepLink: {
    onAuthentication: (listener) =>
      subscribe("deeplink:authentication", listener),
    onWorkshop: (listener) => subscribe("deeplink:workshop", listener),
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
