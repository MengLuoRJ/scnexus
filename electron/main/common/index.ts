import { BrowserWindow } from "electron";
import { initAppIpc } from "./App";
import { initShellIpc } from "./Shell";
import { initDialogIpc } from "./Dialog";
import { initDeepLink } from "./DeepLink";
import { initUpdater } from "./Updater";

export function initCommom() {
  initAppIpc();
  initShellIpc();
  initDialogIpc();
  // initTray();
}

export function initCommomWithWindow(win: BrowserWindow) {
  initDeepLink(win);
  initUpdater(win);
}
