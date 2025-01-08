import * as api from "@scnexus/app-shared/ipc/updater";
import { exposeApis, invoke, subscribe, type ApiListener } from "./common.js";

export const apiUpdaterCheckForUpdatesAndNotify = () =>
  api.apiUpdaterCheckForUpdatesAndNotify(invoke);
export const apiUpdaterCheckForUpdates = () =>
  api.apiUpdaterCheckForUpdates(invoke);
export const apiUpdaterDownloadUpdate = () =>
  api.apiUpdaterDownloadUpdate(invoke);
export const apiUpdaterQuitAndInstall = () =>
  api.apiUpdaterQuitAndInstall(invoke);
export const apiUpdaterOnCheckingForUpdate = (listener: ApiListener) =>
  api.apiUpdaterOnCheckingForUpdate(subscribe, listener);
export const apiUpdaterOnUpdateAvailable = (listener: ApiListener) =>
  api.apiUpdaterOnUpdateAvailable(subscribe, listener);
export const apiUpdaterOnUpdateNotAvailable = (listener: ApiListener) =>
  api.apiUpdaterOnUpdateNotAvailable(subscribe, listener);
export const apiUpdaterOnDownloadProgress = (listener: ApiListener) =>
  api.apiUpdaterOnDownloadProgress(subscribe, listener);
export const apiUpdaterOnUpdateDownloaded = (listener: ApiListener) =>
  api.apiUpdaterOnUpdateDownloaded(subscribe, listener);
export const apiUpdaterOnError = (listener: ApiListener) =>
  api.apiUpdaterOnError(subscribe, listener);

exposeApis({
  apiUpdaterCheckForUpdatesAndNotify,
  apiUpdaterCheckForUpdates,
  apiUpdaterDownloadUpdate,
  apiUpdaterQuitAndInstall,
  apiUpdaterOnCheckingForUpdate,
  apiUpdaterOnUpdateAvailable,
  apiUpdaterOnUpdateNotAvailable,
  apiUpdaterOnDownloadProgress,
  apiUpdaterOnUpdateDownloaded,
  apiUpdaterOnError,
});
