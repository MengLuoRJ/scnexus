import { join } from "node:path";

import { mkdirIfNotExist } from "@electron/main/utils/fs-util";
import { initCustomizeIpc } from "./customize.ipc";
import { profileStore } from "@electron/main/stores/profile";

async function initSCNexusCustomizeDirectory(): Promise<void> {
  const customizePaths = profileStore.get("PROFILE_CUSTOMIZE");
  const scnexusRoot = join(customizePaths.LIBRARY_ROOT);
  if (scnexusRoot) {
    await mkdirIfNotExist(scnexusRoot, { recursive: true });
  }
}

export async function initSCNexusCampaignDirectory(): Promise<void> {
  const customizePaths = profileStore.get("PROFILE_CAMPAIGN");
  const scnexusRoot = join(customizePaths.LIBRARY_ROOT);
  if (scnexusRoot) {
    await mkdirIfNotExist(scnexusRoot, { recursive: true });
  }
}

export async function initCustomizeModule(): Promise<void> {
  if (!profileStore.get("SUCCESS")) return;

  await initSCNexusCustomizeDirectory();
  await initSCNexusCampaignDirectory();

  initCustomizeIpc();
}
