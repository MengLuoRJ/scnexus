import { initWindowIpc } from "./window.ipc";
export * from "./window";
export function initWindowModule() {
  initWindowIpc();
}
