import { exposeApis, invoke } from "../ipc-common.js";

export const apiDialogShowOpenDialogSync = (options: unknown) =>
  invoke("dialog:show-open-dialog-sync", options);
export const apiDialogShowOpenDialog = (options: unknown) =>
  invoke("dialog:show-open-dialog", options);

exposeApis({
  "dialog:show-open-dialog-sync": apiDialogShowOpenDialogSync,
  "dialog:show-open-dialog": apiDialogShowOpenDialog,
});
