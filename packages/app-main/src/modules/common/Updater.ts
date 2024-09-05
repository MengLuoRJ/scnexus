import { app, ipcMain } from "electron";
import { NsisUpdater } from "electron-updater";
import { Logger } from "@/utils/logger";
import { getMainWindow } from "@/mainWindows";
import { ipcHandle } from "@/utils/ipc-util";

let updater: NsisUpdater;

export function initUpdaterModule() {
  if (!app.isPackaged || process.env.NODE_ENV === "development") {
    Logger.info("Updater Unititialized (Not packaged or in development mode)");
    return;
  }

  updater = new NsisUpdater({
    provider: "generic",
    // requestHeaders: {
    //   "ACS-Referer": "scnexus-client-update",
    // },
    url: "https://release.scnexus.net/release/",
    useMultipleRangeRequest: false,
  });

  updater.logger = Logger;

  Logger.info("Updater Initialized");

  // autoUpdater.addAuthHeader(`Bearer ${token}`);
  updater.autoDownload = false;

  updater.on("checking-for-update", () => {
    getMainWindow()?.webContents.send("updater:checking-for-update");
  });

  updater.on("update-available", (info) => {
    getMainWindow()?.webContents.send("updater:update-available", info);
  });

  updater.on("update-not-available", () => {
    getMainWindow()?.webContents.send("updater:update-not-available");
  });

  updater.on("download-progress", (progress) => {
    getMainWindow()?.webContents.send("updater:download-progress", progress);
  });

  updater.on("update-downloaded", () => {
    getMainWindow()?.webContents.send("updater:update-downloaded");
  });

  updater.on("error", (err) => {
    getMainWindow()?.webContents.send("updater:error", err);
  });

  ipcHandle("updater:check-for-updates-and-notify", () =>
    updater.checkForUpdatesAndNotify()
  );

  ipcHandle("updater:check-for-updates", () => updater.checkForUpdates());

  ipcHandle("updater:download-update", () => updater.downloadUpdate());

  ipcHandle("updater:quit-and-install", () => updater.quitAndInstall());
}
