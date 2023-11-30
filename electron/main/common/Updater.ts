import { app, ipcMain } from "electron";
import { NsisUpdater } from "electron-updater";
import { Logger } from "../utils/logger";

let updater: NsisUpdater;

export function initUpdater(win: Electron.BrowserWindow) {
  if (!app.isPackaged || process.env.NODE_ENV === "development") {
    Logger.info("Updater Unititialized (Not packaged or in development mode)");
    return;
  }

  updater = new NsisUpdater({
    provider: "generic",
    // requestHeaders: {
    //   "ACS-Referer": "scnexus-client-update",
    // },
    url: "https://scnexus-release.mengl.me/release/",
  });

  updater.logger = Logger;

  Logger.info("Updater Initialized");

  // autoUpdater.addAuthHeader(`Bearer ${token}`);
  updater.autoDownload = false;

  updater.on("checking-for-update", () => {
    win.webContents.send("updater::checking-for-update");
  });

  updater.on("update-available", (info) => {
    win.webContents.send("updater::update-available", info);
  });

  updater.on("update-not-available", () => {
    win.webContents.send("updater::update-not-available");
  });

  updater.on("download-progress", (progress) => {
    win.webContents.send("updater::download-progress", progress);
  });

  updater.on("update-downloaded", () => {
    win.webContents.send("updater::update-downloaded");
  });

  updater.on("error", (err) => {
    win.webContents.send("updater::error", err);
  });

  ipcMain.handle("updater::check-for-updates-and-notify", () => {
    updater.checkForUpdatesAndNotify();
  });

  ipcMain.handle("updater::check-for-updates", () => {
    updater.checkForUpdates();
  });

  ipcMain.handle("updater::download-update", () => {
    updater.downloadUpdate();
  });

  ipcMain.handle("updater::quit-and-install", () => {
    updater.quitAndInstall();
  });
}

export function destoryUpdater() {
  if (updater) updater.removeAllListeners();
}
