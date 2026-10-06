import { initCampaignModule } from "../campaign";
import { initCustomizeModule } from "../customize";
import { initProfileStore } from "./profile-store";

export async function initGameService(path?: string) {
  const store = await initProfileStore(path);
  if (store.SUCCESS) {
    await initCustomizeModule();
    await initCampaignModule();
  }
  return store;
}
