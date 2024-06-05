import { ipcHandle } from "@electron/main/utils/ipc-util";
import { shell } from "electron";

function initShellIpc() {
  ipcHandle("shell:open-external-website", (link: string) => {
    if (!!link && (link.startsWith("https://") || link.startsWith("http://")))
      shell.openExternal(link);
  });

  ipcHandle("shell:open-path", (path: string) => {
    if (!!path) {
      return shell.openPath(path);
    }
    return;
  });

  ipcHandle("shell:show-item-in-folder", (path: string) => {
    if (!!path) {
      return shell.showItemInFolder(path);
    }
    return;
  });
}

export function initShellModule() {
  initShellIpc();
}
