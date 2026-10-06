import { profileStore } from "@/stores/profile";
import { initCampaignIpc } from "./campaign.ipc";
import { initCampaignDirectory, initCCMDirectory } from "./campaign";
import { initSCNexusCampaignDirectory } from "../customize";
export * from "./campaign";

let registered = false;
export async function initCampaignModule(): Promise<void> {
  if (!registered) {
    initCampaignIpc();
    registered = true;
  }
  if (!profileStore.get("SUCCESS")) return;
  await initSCNexusCampaignDirectory();
  await initCampaignDirectory();
  await initCCMDirectory();
}
