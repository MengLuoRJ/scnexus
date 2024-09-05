import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let mainWindow: BrowserWindow | null = null;

export function getMainWindow() {
  return mainWindow;
}

export function destroyMainWindow() {
  mainWindow?.destroy();
  mainWindow = null;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: "SCNexus Client",
    // icon: join(process.env.PUBLIC, "favicon.ico"),
    show: false,
    // resizable: false,
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(app.getAppPath(), "packages/app-preload/dist/index.mjs"),
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      nodeIntegration: true,
      contextIsolation: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    if (import.meta.env.DEV) {
      mainWindow?.webContents.openDevTools();
    }
  });

  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_DEV_SERVER_URL !== undefined
  ) {
    await mainWindow.loadURL(import.meta.env.VITE_DEV_SERVER_URL);
  } else {
    /**
     * Load from the local file system for production and test.
     *
     * Use BrowserWindow.loadFile() instead of BrowserWindow.loadURL() for WhatWG URL API limitations
     * when path contains special characters like `#`.
     * Let electron handle the path quirks.
     * @see https://github.com/nodejs/node/issues/12682
     * @see https://github.com/electron/electron/issues/6869
     */
    await mainWindow.loadFile(
      fileURLToPath(
        new URL("./../../app-renderer/dist/index.html", import.meta.url)
      )
    );
  }
  // Test actively push message to the Electron-Renderer
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.send(
      "main-process-message",
      new Date().toLocaleString()
    );
  });

  // Make all links open with the browser, not with the application
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });
  // win.webContents.on('will-navigate', (event, url) => { }) #344
}

export async function restoreOrCreateWindow() {
  let window = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());

  if (window === undefined) {
    await createWindow();
  }

  if (mainWindow?.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow?.focus();
}
