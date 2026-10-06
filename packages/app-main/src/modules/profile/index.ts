import { initProfileIpc } from "./profile.ipc";
import { initProfileStore } from "./profile-store";
export * from "./profile";

let registered = false;
export async function initProfileModule() {
  if (!registered) {
    initProfileIpc();
    registered = true;
  }
  await initProfileStore();
}
