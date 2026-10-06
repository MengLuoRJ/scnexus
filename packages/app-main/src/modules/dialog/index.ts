import { initDialogIpc } from "./dialog.ipc";
export * from "./dialog";

export function initDialogModule() {
  initDialogIpc();
}
