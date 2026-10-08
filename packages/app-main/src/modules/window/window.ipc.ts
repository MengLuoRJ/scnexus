import { ipcHandle } from "../../utils/ipc-util";
import {
  closeMainWindow,
  getWindowStatus,
  markWindowReady,
  minimizeMainWindow,
  restoreOrCreateWindow,
  setMainWindowMaximized,
} from "./window";

export function initWindowIpc() {
  ipcHandle("window:get-status", getWindowStatus);
  ipcHandle("window:show", async () => {
    await restoreOrCreateWindow();
    return getWindowStatus();
  });
  ipcHandle("window:minimize", minimizeMainWindow);
  ipcHandle("window:set-maximized", setMainWindowMaximized);
  ipcHandle("window:close", () => {
    setImmediate(closeMainWindow);
  });
  ipcHandle("window:ready", markWindowReady);
}
