import { ipcMain, shell } from "electron";

export function initShellIpc() {
  ipcMain.handle("shell::open-external-website", (e, link: string) => {
    if (!!link && (link.startsWith("https://") || link.startsWith("http://"))) {
      shell.openExternal(link);
      return {
        success: true,
        message: "External website opened successfully",
      };
    } else {
      return {
        success: false,
        message: "INVALID_LINK",
      };
    }
  });
  ipcMain.handle("shell::open-path", (e, path: string) => {
    if (!!path) {
      shell.openPath(path);
    }
  });
}
