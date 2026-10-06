import { initWorkshopIpc } from "./workshop.ipc";
export * from "./workshop";

let registered = false;
export async function initWorkshopModule() {
  if (registered) return;
  initWorkshopIpc();
  registered = true;
}
