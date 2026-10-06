import { dialog } from "electron";
import type { OpenDialogOptions, OpenDialogSyncOptions } from "electron";

export function showOpenDialogSync(options: OpenDialogSyncOptions) {
  return dialog.showOpenDialogSync(options);
}
export function showOpenDialog(options: OpenDialogOptions) {
  return dialog.showOpenDialog(options);
}
