import type { AppErrorDto } from "@scnexus/app-shared/errors/app.error";
import { bridgeRequest, bridgeSubscription } from "./internal/bridge";
export type UpdaterStatus = {
  state:
    | "unavailable"
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "installing"
    | "failed";
};
export const apiUpdaterGetStatus = () => bridgeRequest<UpdaterStatus>("updater:status");
export const apiUpdaterCheckForUpdates = () => bridgeRequest<unknown>("updater:check-for-updates");
export const apiUpdaterCheckForUpdatesAndNotify = () =>
  bridgeRequest<unknown>("updater:check-for-updates-and-notify");
export const apiUpdaterDownloadUpdate = () => bridgeRequest<string[]>("updater:download-update");
export const apiUpdaterQuitAndInstall = () => bridgeRequest<void>("updater:quit-and-install");
export const apiUpdaterOnCheckingForUpdate = (listener: () => void) =>
  bridgeSubscription("updater:checking-for-update", listener);
export const apiUpdaterOnUpdateAvailable = (listener: (info: unknown) => void) =>
  bridgeSubscription("updater:update-available", listener);
export const apiUpdaterOnUpdateNotAvailable = (listener: () => void) =>
  bridgeSubscription("updater:update-not-available", listener);
export const apiUpdaterOnDownloadProgress = (
  listener: (progress: {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
  }) => void,
) => bridgeSubscription("updater:download-progress", listener);
export const apiUpdaterOnUpdateDownloaded = (listener: () => void) =>
  bridgeSubscription("updater:update-downloaded", listener);
export const apiUpdaterOnError = (listener: (error: AppErrorDto) => void) =>
  bridgeSubscription("updater:error", listener);
