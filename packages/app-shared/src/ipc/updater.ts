import type { ApiInvoke, ApiListener, ApiSubscribe } from "./types";

export const apiUpdaterCheckForUpdatesAndNotify = (invoke: ApiInvoke) =>
  invoke("updater:check-for-updates-and-notify");
export const apiUpdaterCheckForUpdates = (invoke: ApiInvoke) =>
  invoke("updater:check-for-updates");
export const apiUpdaterDownloadUpdate = (invoke: ApiInvoke) =>
  invoke("updater:download-update");
export const apiUpdaterQuitAndInstall = (invoke: ApiInvoke) =>
  invoke("updater:quit-and-install");
export const apiUpdaterOnCheckingForUpdate = (
  subscribe: ApiSubscribe,
  listener: ApiListener,
) => subscribe("updater:checking-for-update", listener);
export const apiUpdaterOnUpdateAvailable = (
  subscribe: ApiSubscribe,
  listener: ApiListener,
) => subscribe("updater:update-available", listener);
export const apiUpdaterOnUpdateNotAvailable = (
  subscribe: ApiSubscribe,
  listener: ApiListener,
) => subscribe("updater:update-not-available", listener);
export const apiUpdaterOnDownloadProgress = (
  subscribe: ApiSubscribe,
  listener: ApiListener,
) => subscribe("updater:download-progress", listener);
export const apiUpdaterOnUpdateDownloaded = (
  subscribe: ApiSubscribe,
  listener: ApiListener,
) => subscribe("updater:update-downloaded", listener);
export const apiUpdaterOnError = (
  subscribe: ApiSubscribe,
  listener: ApiListener,
) => subscribe("updater:error", listener);
