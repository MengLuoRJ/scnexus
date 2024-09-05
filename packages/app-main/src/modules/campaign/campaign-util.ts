import { join, basename } from "node:path";
import { readdir, copyFile, cp } from "node:fs/promises";

import { CampaignType, MetadataInformated } from "scnexus-standard/metadata";
import {
  rmDirWhitely,
  rmFilesFromDirWhitely,
} from "../customize/customize-util";
import { profileStore } from "@/stores/profile";
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

  const CopyFilesMatched = async (
    file_name: string,
    source_starter?: string,
    target_starter?: string
  ) => {
    if (file_name.endsWith(".SC2Map") || file_name.endsWith(".sc2map")) {
      await cp(
        join(source_starter ?? filesRoot, file_name),
        join(target_starter ?? campaignRoot, file_name),
        {
          recursive: true,
        }
      );
    } else if (file_name.endsWith(".SC2Mod") || file_name.endsWith(".sc2mod")) {
      await cp(
        join(source_starter ?? filesRoot, file_name),
        join(modsRoot, file_name),
        {
          recursive: true,
        }
      );
    }
  };

  const files = await readdir(filesRoot, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  for (const file of files) {
    if (infor.campaign === "LOTV" && file.name === "voidprologue") {
      const vpFiles = await readdir(join(filesRoot, "voidprologue"), {
        encoding: "utf-8",
        withFileTypes: true,
      });
      for (const vpFile of vpFiles) {
        await CopyFilesMatched(
          vpFile.name,
          join(filesRoot, "voidprologue"),
          join(campaignRoot, "..", "voidprologue")
        );
      }
    } else if (infor.campaign === "HOTS" && file.name === "evolution") {
      const evoFiles = await readdir(join(filesRoot, "evolution"), {
        encoding: "utf-8",
        withFileTypes: true,
      });
      for (const evoFile of evoFiles) {
        await CopyFilesMatched(
          evoFile.name,
          join(filesRoot, "evolution"),
          join(campaignRoot, "evolution")
        );
      }
    }
    await CopyFilesMatched(file.name);
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
