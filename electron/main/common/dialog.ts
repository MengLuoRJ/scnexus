import { OpenDialogSyncOptions, dialog, ipcMain, shell } from "electron";

export function initDialogIpc() {
  ipcMain.handle(
    "dialog::show-open-dialog-sync",
    (e, options: OpenDialogSyncOptions) => {
      return dialog.showOpenDialogSync(options);
    }
  );
  ipcMain.handle(
    "dialog::show-open-dialog",
    (e, options: OpenDialogSyncOptions) => {
      return dialog.showOpenDialog(options);
    }
  );
}
