import * as api from "@scnexus/app-shared/ipc/updater";
import { exposeInvoke, exposeSubscribe } from "./common.js";

exposeInvoke("apiUpdaterCheckForUpdatesAndNotify", api.apiUpdaterCheckForUpdatesAndNotify);
exposeInvoke("apiUpdaterCheckForUpdates", api.apiUpdaterCheckForUpdates);
exposeInvoke("apiUpdaterDownloadUpdate", api.apiUpdaterDownloadUpdate);
exposeInvoke("apiUpdaterQuitAndInstall", api.apiUpdaterQuitAndInstall);
exposeSubscribe("apiUpdaterOnCheckingForUpdate", api.apiUpdaterOnCheckingForUpdate);
exposeSubscribe("apiUpdaterOnUpdateAvailable", api.apiUpdaterOnUpdateAvailable);
exposeSubscribe("apiUpdaterOnUpdateNotAvailable", api.apiUpdaterOnUpdateNotAvailable);
exposeSubscribe("apiUpdaterOnDownloadProgress", api.apiUpdaterOnDownloadProgress);
exposeSubscribe("apiUpdaterOnUpdateDownloaded", api.apiUpdaterOnUpdateDownloaded);
exposeSubscribe("apiUpdaterOnError", api.apiUpdaterOnError);