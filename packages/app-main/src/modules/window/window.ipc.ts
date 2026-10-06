import { ipcHandleTyped } from "../../utils/ipc-util";
import {
  closeMainWindow,
  getWindowStatus,
  markWindowReady,
  minimizeMainWindow,
  restoreOrCreateWindow,
  setMainWindowMaximized,
} from "./window";

export function initWindowIpc() {
  ipcHandleTyped("window:get-status", getWindowStatus);
  ipcHandleTyped("window:show", async () => {
    await restoreOrCreateWindow();
    return getWindowStatus();
  });
  ipcHandleTyped("window:minimize", minimizeMainWindow);
  ipcHandleTyped("window:set-maximized", setMainWindowMaximized);
  ipcHandleTyped("window:close", () => {
    setImmediate(closeMainWindow);
  });
  ipcHandleTyped("window:ready", markWindowReady);
}
