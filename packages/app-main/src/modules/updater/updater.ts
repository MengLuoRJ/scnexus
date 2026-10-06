import { app } from "electron";
import { NsisUpdater } from "electron-updater";
import { Logger } from "@/modules/logging";
import { sendWhenReady } from "@/modules/window";
import {
  AppError,
  ERRORS,
  normalizeError,
  toErrorDto,
} from "@scnexus/app-shared/errors/app.error";

let updater: NsisUpdater | undefined;

export function initializeUpdater(): void {
  if (updater) return;
  if (
    !app.isPackaged ||
    process.env.NODE_ENV === "development" ||
    process.platform !== "win32"
  ) {
    Logger.info(
      "Updater unavailable (not packaged, development mode, or non-Windows platform)",
    );
    return;
  }
  updater = new NsisUpdater({
    provider: "generic",
    url: "https://release.scnexus.net/release/",
    useMultipleRangeRequest: false,
  });
  updater.logger = Logger;
  updater.autoDownload = false;
  updater.on("checking-for-update", () =>
    sendWhenReady("updater:checking-for-update"),
  );
  updater.on("update-available", (info) =>
    sendWhenReady("updater:update-available", info),
  );
  updater.on("update-not-available", () =>
    sendWhenReady("updater:update-not-available"),
  );
  updater.on("download-progress", (progress) =>
    sendWhenReady("updater:download-progress", progress),
  );
  updater.on("update-downloaded", () =>
    sendWhenReady("updater:update-downloaded"),
  );
  updater.on("error", (error) =>
    sendWhenReady(
      "updater:error",
      toErrorDto(normalizeError(error, ERRORS.UPDATER_DOWNLOAD_FAILED)),
    ),
  );
  Logger.info("Updater initialized");
}

function requireUpdater(): NsisUpdater {
  if (!updater) {
    throw new AppError(ERRORS.UPDATER_UNAVAILABLE, {
      message: "Updates are unavailable in this environment",
    });
  }
  return updater;
}

export const checkForUpdatesAndNotify = () =>
  requireUpdater().checkForUpdatesAndNotify();
export const checkForUpdates = () => requireUpdater().checkForUpdates();
export const downloadUpdate = () => requireUpdater().downloadUpdate();
export const quitAndInstall = () => requireUpdater().quitAndInstall();
