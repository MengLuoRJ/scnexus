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
let state:
  | "unavailable"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "failed" = "unavailable";
let phase: "check" | "download" | "install" = "check";
let beforeInstall: (() => Promise<void>) | undefined;
export function setBeforeUpdateInstall(callback: () => Promise<void>) {
  beforeInstall = callback;
}
export function isInstallingUpdate() {
  return state === "installing";
}
export function getUpdaterStatus() {
  return { state };
}
function updateError(error: unknown) {
  const definition =
    phase === "check"
      ? ERRORS.UPDATER_CHECK_FAILED
      : phase === "download"
        ? ERRORS.UPDATER_DOWNLOAD_FAILED
        : ERRORS.UPDATER_INSTALL_FAILED;
  state = "failed";
  const normalized = normalizeError(error, definition);
  sendWhenReady("updater:error", toErrorDto(normalized));
  return normalized;
}

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
  updater.autoInstallOnAppQuit = false;
  state = "idle";
  updater.on("checking-for-update", () => {
    state = "checking";
    phase = "check";
    sendWhenReady("updater:checking-for-update");
  });
  updater.on("update-available", (info) => {
    state = "available";
    sendWhenReady("updater:update-available", info);
  });
  updater.on("update-not-available", () => {
    state = "idle";
    sendWhenReady("updater:update-not-available");
  });
  updater.on("download-progress", (progress) =>
    sendWhenReady("updater:download-progress", progress),
  );
  updater.on("update-downloaded", () => {
    state = "downloaded";
    sendWhenReady("updater:update-downloaded");
  });
  updater.on("error", updateError);
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

async function check(notify: boolean) {
  const current = requireUpdater();
  if (["checking", "downloading", "downloaded", "installing"].includes(state))
    throw new AppError(ERRORS.TASK_CONFLICT);
  state = "checking";
  phase = "check";
  try {
    return await (notify
      ? current.checkForUpdatesAndNotify()
      : current.checkForUpdates());
  } catch (error) {
    throw updateError(error);
  }
}
export const checkForUpdatesAndNotify = () => check(true);
export const checkForUpdates = () => check(false);
export async function downloadUpdate() {
  const current = requireUpdater();
  if (state !== "available")
    throw new AppError(ERRORS.UPDATER_DOWNLOAD_FAILED, {
      message: "Check for an available update first",
    });
  state = "downloading";
  phase = "download";
  try {
    return await current.downloadUpdate();
  } catch (error) {
    throw updateError(error);
  }
}
export async function quitAndInstall() {
  const current = requireUpdater();
  if (state !== "downloaded")
    throw new AppError(ERRORS.UPDATER_INSTALL_FAILED, {
      message: "Update is not downloaded",
    });
  state = "installing";
  phase = "install";
  try {
    await beforeInstall?.();
    current.quitAndInstall();
  } catch (error) {
    throw updateError(error);
  }
}
