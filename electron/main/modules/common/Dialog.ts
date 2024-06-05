import { ipcHandle } from "@electron/main/utils/ipc-util";
import { OpenDialogOptions, OpenDialogSyncOptions, dialog } from "electron";

function initDialogIpc() {
  ipcHandle(
    "dialog:show-open-dialog-sync",
    (options: OpenDialogSyncOptions) => {
      return dialog.showOpenDialogSync(options);
    }
  );

  ipcHandle("dialog:show-open-dialog", (options: OpenDialogOptions) => {
    return dialog.showOpenDialog(options);
  });
}

export function initDialogModule() {
  initDialogIpc();
}
