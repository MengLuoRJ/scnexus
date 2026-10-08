import { ipcHandle } from "@/utils/ipc-util";
import {
  checkForUpdatesAndNotify,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getUpdaterStatus,
} from "./updater";

export function initUpdaterIpc() {
  ipcHandle("updater:status", getUpdaterStatus);
  ipcHandle("updater:check-for-updates-and-notify", checkForUpdatesAndNotify);
  ipcHandle("updater:check-for-updates", checkForUpdates);
  ipcHandle("updater:download-update", downloadUpdate);
  ipcHandle("updater:quit-and-install", quitAndInstall);
}
