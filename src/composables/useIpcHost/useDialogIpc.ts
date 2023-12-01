import { OpenDialogOptions, OpenDialogSyncOptions } from "electron";

const ipcRenderer = window.ipcRenderer;

export async function showOpenDialogSync(options: OpenDialogSyncOptions) {
  return ipcRenderer.invoke("dialog::show-open-dialog-sync", options);
}

export async function showOpenDialog(options: OpenDialogOptions) {
  return ipcRenderer.invoke("dialog::show-open-dialog", options);
}
