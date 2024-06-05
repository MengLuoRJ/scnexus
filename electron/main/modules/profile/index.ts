import { profileStore } from "@electron/main/stores/profile";

import { initCampaignModule } from "../campaign";
import { initCustomizeModule } from "../customize";

import { initProfileIpc } from "./profile.ipc";
import { initProfileStore } from "./profile-store";

export async function initProfileModule() {
  if (!profileStore.get("SUCCESS")) {
    await initProfileStore();
  }

  initProfileIpc();
}

export async function initGameService(path?: string) {
  const store = await initProfileStore(path);
  if (store.SUCCESS) {
    await initCustomizeModule();
    await initCampaignModule();
  }
  return store;
}
