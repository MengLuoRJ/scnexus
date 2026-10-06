import { join } from "node:path";

import { mkdirIfNotExist } from "@/utils/fs-util";
import { profileStore } from "@/stores/profile";

export async function initSCNexusCustomizeDirectory(): Promise<void> {
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
