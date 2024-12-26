import type { ApiInvoke } from "./types";

export const apiDialogShowOpenDialogSync = (
  invoke: ApiInvoke,
  options: unknown,
) => invoke("dialog:show-open-dialog-sync", options);
export const apiDialogShowOpenDialog = (invoke: ApiInvoke, options: unknown) =>
  invoke("dialog:show-open-dialog", options);
