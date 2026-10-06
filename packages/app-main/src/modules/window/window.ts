import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
import type { WindowStatus } from "@scnexus/app-shared/types/desktop.type";
import { reportError } from "../logging/logging";
import { openExternalWebsite } from "../shell";

let mainWindow: BrowserWindow | null = null;
let creation: Promise<BrowserWindow> | undefined;
let state: WindowStatus["state"] = "absent";
let ready = false;
const queue: { channel: string; args: unknown[] }[] = [];
const readyListeners = new Set<() => void>();

export function getMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}
export function getWindowStatus(): WindowStatus {
  const window = getMainWindow();
  return {
    state,
    minimized: window?.isMinimized() ?? false,
    maximized: window?.isMaximized() ?? false,
  };
}
function publishStatus() {
  getMainWindow()?.webContents.send("window:status", getWindowStatus());
}
export function onWindowReady(listener: () => void) {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}
export function markWindowReady() {
  const window = getMainWindow();
  if (!window || window.webContents.isLoadingMainFrame())
    throw new AppError(ERRORS.WINDOW_NOT_READY);
  if (ready) return getWindowStatus();
  ready = true;
  state = "ready";
  for (const item of queue.splice(0))
    window.webContents.send(item.channel, ...item.args);
  for (const listener of readyListeners) listener();
  publishStatus();
  return getWindowStatus();
}
export function sendWhenReady(channel: string, ...args: unknown[]) {
  const window = getMainWindow();
  if (ready && window) {
    window.webContents.send(channel, ...args);
    return;
  }
  if (!channel.startsWith("deeplink:")) {
    const previous = queue.findIndex((item) => item.channel === channel);
    if (previous >= 0) {
      queue[previous] = { channel, args };
      return;
    }
  }
  if (queue.length >= 32) throw new AppError(ERRORS.DEEP_LINK_QUEUE_FULL);
  queue.push({ channel, args });
}
export function destroyMainWindow() {
  getMainWindow()?.destroy();
  mainWindow = null;
  ready = false;
  state = "absent";
}

async function createMainWindow(): Promise<BrowserWindow> {
  let window: BrowserWindow;
  try {
    window = new BrowserWindow({
      title: "SCNexus Client",
      show: false,
      width: 800,
      height: 600,
      minWidth: 800,
      minHeight: 600,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(
          app.getAppPath(),
          "packages",
          "app-preload",
          "dist",
          "index.mjs",
        ),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });
  } catch (cause) {
    state = "failed";
    throw new AppError(ERRORS.WINDOW_CREATE_FAILED, {}, { cause });
  }
  mainWindow = window;
  state = "loading";
  ready = false;
  window.once("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
      ready = false;
      state = "absent";
    }
  });
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) {
      window.show();
      if (import.meta.env.DEV) window.webContents.openDevTools();
    }
  });
  window.on("minimize", publishStatus);
  window.on("restore", publishStatus);
  window.on("maximize", publishStatus);
  window.on("unmaximize", publishStatus);
  window.webContents.on(
    "did-start-navigation",
    (_event, _url, _inPlace, isMainFrame) => {
      if (isMainFrame) {
        ready = false;
        state = "loading";
      }
    },
  );
  window.webContents.on("render-process-gone", () => {
    ready = false;
    state = "failed";
    reportError(new AppError(ERRORS.WINDOW_RENDERER_FAILED), "window");
  });
  const file = join(
    app.getAppPath(),
    "packages",
    "app-renderer-v2",
    "dist",
    "index.html",
  );
  const target =
    import.meta.env.DEV && import.meta.env.VITE_DEV_SERVER_URL
      ? import.meta.env.VITE_DEV_SERVER_URL
      : pathToFileURL(file).href;
  window.webContents.on("will-navigate", (event, url) => {
    if (url.split("#")[0] !== target.split("#")[0]) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void openExternalWebsite(url).catch((error) =>
        reportError(error, "shell"),
      );
    }
    return { action: "deny" };
  });
  try {
    if (target.startsWith("file:")) await window.loadFile(file);
    else await window.loadURL(target);
    return window;
  } catch (cause) {
    window.destroy();
    state = "failed";
    throw new AppError(ERRORS.WINDOW_LOAD_FAILED, {}, { cause });
  }
}

export async function restoreOrCreateWindow(): Promise<BrowserWindow> {
  const current = getMainWindow();
  if (!creation && !current) {
    creation = createMainWindow();
    try {
      await creation;
    } finally {
      creation = undefined;
    }
  } else if (creation) await creation;
  const window = getMainWindow();
  if (!window) throw new AppError(ERRORS.WINDOW_NOT_READY);
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  return window;
}

export function minimizeMainWindow() {
  getMainWindow()?.minimize();
  return getWindowStatus();
}
export function setMainWindowMaximized(value: boolean) {
  if (typeof value !== "boolean")
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
  if (value) getMainWindow()?.maximize();
  else getMainWindow()?.unmaximize();
  return getWindowStatus();
}
export function closeMainWindow() {
  getMainWindow()?.close();
}
