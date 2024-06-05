import { join, basename } from "node:path";
import { readdir, copyFile, cp } from "node:fs/promises";

import { CampaignType, MetadataInformated } from "scnexus-standard/metadata";
import {
  rmDirWhitely,
  rmFilesFromDirWhitely,
} from "../customize/customize-util";
import { profileStore } from "@electron/main/stores/profile";
import { getProfileStoreCampaignTypeRoot } from "../profile/profile-util";

export async function cleanActiveOfficialCampaignMapFiles(
  campaign: CampaignType
): Promise<void> {
  const campaignRoot = getProfileStoreCampaignTypeRoot(campaign);
  console.log(campaignRoot);
  if (!campaignRoot) return;

  if (campaign === "WOL") {
    await rmFilesFromDirWhitely(campaignRoot, [
      "swarm",
      "void",
      "voidprologue",
      "nova",
    ]);
  } else if (campaign === "HOTS") {
    await rmFilesFromDirWhitely(campaignRoot, ["evolution"]);
    await rmFilesFromDirWhitely(join(campaignRoot, "evolution"));
  } else if (campaign === "LOTV") {
    await rmFilesFromDirWhitely(campaignRoot);
    await rmFilesFromDirWhitely(join(campaignRoot, "..", "voidprologue"));
  } else if (campaign === "NCO") {
    await rmFilesFromDirWhitely(campaignRoot);
  }
}

export async function copyinCampaignFiles(
  infor: MetadataInformated
): Promise<MetadataInformated | undefined> {
  if (!infor.campaign || !infor.localinfo.metadata_path) return;

  const filesRoot = join(infor.localinfo.metadata_path, "..");

  const filesCampaignRoot = join(filesRoot, "Maps", "Campaign");
  const campaignRoot = join(
    profileStore.get("PROFILE_CAMPAIGN").MAPS_ROOT,
    "Campaign"
  );
  await cp(filesCampaignRoot, campaignRoot);

  const filesModsRoot = join(filesRoot, "Mods", infor.mods_directory!);
  const modsRoot = join(
    profileStore.get("PROFILE_CAMPAIGN").MODS_ROOT,
    infor.mods_directory!
  );
  await cp(filesModsRoot, modsRoot);

  const filesMapsRoot = join(filesRoot, "Maps", infor.maps_directory!);
  const mapsRoot = join(
    profileStore.get("PROFILE_CAMPAIGN").MAPS_ROOT,
    infor.maps_directory!
  );
  await cp(filesMapsRoot, mapsRoot);

  const newMetadataPath = join(
    campaignRoot,
    basename(infor.localinfo.metadata_path)
  );
  await copyFile(infor.localinfo.metadata_path, newMetadataPath);

  return {
    ...infor,
    localinfo: {
      ...infor.localinfo,
      metadata_path: newMetadataPath,
    },
  };
}

export async function cleanCampaignFiles(
  infor: MetadataInformated
): Promise<void> {
  if (!infor.campaign || !infor.localinfo.metadata_path) return;

  const modsRoot = join(
    profileStore.get("PROFILE_CAMPAIGN").MODS_ROOT,
    infor.mods_directory!
  );
  await rmDirWhitely(modsRoot);

  const mapsRoot = join(
    profileStore.get("PROFILE_CAMPAIGN").MAPS_ROOT,
    infor.maps_directory!
  );
  await rmDirWhitely(mapsRoot);

  await cleanActiveOfficialCampaignMapFiles(infor.campaign);
}

export async function copyinCampaignFilesCCM(
  infor: MetadataInformated
): Promise<MetadataInformated | undefined> {
  if (!infor.campaign || !infor.localinfo.metadata_path) return;

  const filesRoot = join(infor.localinfo.metadata_path, "..");
  const modsRoot = profileStore.get("PROFILE_CAMPAIGN").MODS_ROOT;
  const campaignRoot = getProfileStoreCampaignTypeRoot(infor.campaign);
  if (!campaignRoot) return;

  const files = await readdir(filesRoot, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  for (const file of files) {
    if (infor.campaign === "LOTV" && file.name === "voidprologue") {
      await cp(
        join(filesRoot, file.name),
        join(campaignRoot, "..", "voidprologue"),
        {
          recursive: true,
        }
      );
    } else if (file.name.endsWith(".SC2Map") || file.name.endsWith(".sc2map")) {
      await cp(join(filesRoot, file.name), join(campaignRoot, file.name), {
        recursive: true,
      });
    } else if (file.name.endsWith(".SC2Mod") || file.name.endsWith(".sc2mod")) {
      await cp(join(filesRoot, file.name), join(modsRoot, file.name), {
        recursive: true,
      });
    }
  }

  const newMetadataPath = join(
    campaignRoot,
    basename(infor.localinfo.metadata_path)
  );
  await copyFile(infor.localinfo.metadata_path, newMetadataPath);

  return {
    ...infor,
    localinfo: {
      ...infor.localinfo,
      metadata_path: newMetadataPath,
    },
  };
}

/**
 * Clean campaign files in Campaign directory when unactive CCM campaign pack,
 * beware that this function only be used for CCM manager campaign pack,
 * which means it would not take part in Mods/dependencies clean process.
 * @param {CampaignType} infor - type of campaign
 * @returns
 */
export async function cleanCampaignFilesCCM(
  infor: MetadataInformated
): Promise<void> {
  if (!infor.campaign || !infor.localinfo.metadata_path) return;
  await cleanActiveOfficialCampaignMapFiles(infor.campaign);
}
