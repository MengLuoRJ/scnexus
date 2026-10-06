import { join } from "node:path";

import { mkdirIfNotExist } from "@/utils/fs-util";
import { profileStore } from "@/stores/profile";

export async function initCampaignDirectory(): Promise<void> {
  const customizePaths = profileStore.get("PROFILE_CAMPAIGN");

  type PathKey = keyof typeof customizePaths;
  let pathKey: PathKey;
  for (pathKey in customizePaths) {
    if (customizePaths[pathKey]) {
      await mkdirIfNotExist(customizePaths[pathKey]);
    }
  }

  // if (customizePaths.MODS_ROOT) {
  //   await mkdirIfNotExist(customizePaths.MODS_ROOT);
  // }
  // if (customizePaths.MAPS_ROOT) {
  //   await mkdirIfNotExist(customizePaths.MAPS_ROOT);
  // }
  // if (customizePaths.WOL_ROOT) {
  //   await mkdirIfNotExist(customizePaths.WOL_ROOT);
  // }
  // if (customizePaths.HOTS_ROOT) {
  //   await mkdirIfNotExist(customizePaths.HOTS_ROOT);
  // }
  // if (customizePaths.HOTS_EVO_ROOT) {
  //   await mkdirIfNotExist(customizePaths.HOTS_EVO_ROOT);
  // }
  // if (customizePaths.LOTV_ROOT) {
  //   await mkdirIfNotExist(customizePaths.LOTV_ROOT);
  // }
  // if (customizePaths.LOTV_PRO_ROOT) {
  //   await mkdirIfNotExist(customizePaths.LOTV_PRO_ROOT);
  // }
  // if (customizePaths.NCO_ROOT) {
  //   await mkdirIfNotExist(customizePaths.NCO_ROOT);
  // }
}

export async function initCCMDirectory(): Promise<void> {
  const customizePaths = profileStore.get("PROFILE_CAMPAIGN");
  if (customizePaths.MAPS_ROOT) {
    await mkdirIfNotExist(join(customizePaths.MAPS_ROOT, "CustomCampaigns"));
  }
}
