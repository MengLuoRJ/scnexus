import { exposeApis, invoke, subscribe, type ApiListener } from "./common.js";

export const apiUpdaterCheckForUpdatesAndNotify = () =>
  invoke("updater:check-for-updates-and-notify");
export const apiUpdaterCheckForUpdates = () =>
  invoke("updater:check-for-updates");
export const apiUpdaterDownloadUpdate = () =>
  invoke("updater:download-update");
export const apiUpdaterQuitAndInstall = () =>
  invoke("updater:quit-and-install");
export const apiUpdaterOnCheckingForUpdate = (listener: ApiListener) =>
  subscribe("updater:checking-for-update", listener);
export const apiUpdaterOnUpdateAvailable = (listener: ApiListener) =>
  subscribe("updater:update-available", listener);
export const apiUpdaterOnUpdateNotAvailable = (listener: ApiListener) =>
  subscribe("updater:update-not-available", listener);
export const apiUpdaterOnDownloadProgress = (listener: ApiListener) =>
  subscribe("updater:download-progress", listener);
export const apiUpdaterOnUpdateDownloaded = (listener: ApiListener) =>
  subscribe("updater:update-downloaded", listener);
export const apiUpdaterOnError = (listener: ApiListener) =>
  subscribe("updater:error", listener);

exposeApis({
  "updater:check-for-updates-and-notify": apiUpdaterCheckForUpdatesAndNotify,
  "updater:check-for-updates": apiUpdaterCheckForUpdates,
  "updater:download-update": apiUpdaterDownloadUpdate,
  "updater:quit-and-install": apiUpdaterQuitAndInstall,
  "updater:checking-for-update": apiUpdaterOnCheckingForUpdate,
  "updater:update-available": apiUpdaterOnUpdateAvailable,
  "updater:update-not-available": apiUpdaterOnUpdateNotAvailable,
  "updater:download-progress": apiUpdaterOnDownloadProgress,
  "updater:update-downloaded": apiUpdaterOnUpdateDownloaded,
  "updater:error": apiUpdaterOnError,
});
