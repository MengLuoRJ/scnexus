import { profileStore } from "@/stores/profile";
import { initCustomizeIpc } from "./customize.ipc";
import {
  initSCNexusCustomizeDirectory,
  initSCNexusCampaignDirectory,
} from "./customize";
export * from "./customize";

let registered = false;
export async function initCustomizeModule(): Promise<void> {
  if (!registered) {
    initCustomizeIpc();
    registered = true;
  }
  if (!profileStore.get("SUCCESS")) return;
  await initSCNexusCustomizeDirectory();
  await initSCNexusCampaignDirectory();
}
