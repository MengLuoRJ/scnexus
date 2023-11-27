import { ipcMain, shell } from "electron";

export function initShellIpc() {
  ipcMain.handle("shell::open-external-website", (e, link: string) => {
    if (!!link && (link.startsWith("https://") || link.startsWith("http://")))
      shell.openExternal(link);
  });
  ipcMain.handle("shell::open-path", (e, path: string) => {
    if (!!path) {
      shell.openPath(path);
    }
  });
  ipcMain.handle("shell::show-item-in-folder", (e, path: string) => {
    if (!!path) {
      shell.showItemInFolder(path);
    }
  });
}
