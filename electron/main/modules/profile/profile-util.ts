import { profileStore } from "@electron/main/stores/profile";
import { exists } from "@electron/main/utils/fs-util";
import { access, readdir } from "node:fs/promises";
import { CampaignType } from "scnexus-standard/metadata";

export function getProfileStoreCampaignTypeRoot(
  type: CampaignType
): string | undefined {
  const campaignPaths = profileStore.get("PROFILE_CAMPAIGN");
  const campaignTypeRoot = campaignPaths[`${type}_ROOT`] as string | undefined;
  return campaignTypeRoot ?? undefined;
}

export async function checkGameRootValid(gameRoot: string): Promise<boolean> {
  console.log("checkGameRootValid", gameRoot);
  if (!gameRoot) return false;

  const exist = await exists(gameRoot);

  if (!exist) return false;

  const rootFiles = await readdir(gameRoot, { withFileTypes: true });

  if (
    rootFiles.some(
      (dirent) => dirent.isFile() && dirent.name === "StarCraft II.exe"
    )
  ) {
    return true;
  } else {
    return false;
  }
}
