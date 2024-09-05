import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanActiveOfficialCampaignMapFiles,
  cleanCampaignFiles,
  cleanCampaignFilesCCM,
  copyinCampaignFiles,
  copyinCampaignFilesCCM,
} from "./campaign-util";
import { getProfileStoreCampaignTypeRoot } from "@/modules/profile/profile-util";
import {
  ccmMetaFileParser,
  scnexusMetaFileParser,
} from "@/modules/customize/customize-util";
import { countPathCompatible } from "@/utils/fs-util";

import {
  CampaignActiveStore,
  getCampaignActiveStore,
  getCampaignActiveStoreKey,
  insertStoreActiveCampaign,
  removeStoreActiveCampaign,
  updateCampaignActiveStore,
} from "@/stores/campaign-active";
import {
  CampaignType,
  MetadataInformated,
  MetadataInformatedCampaignSet,
  MetadataStandard,
} from "scnexus-standard/metadata";

async function ActiveCampaignSearcher(
  campaignType: CampaignType
): Promise<MetadataInformated | undefined> {
  const campaignRoot = getProfileStoreCampaignTypeRoot(campaignType);
  if (!campaignRoot) return;

  const files = await readdir(campaignRoot, {
    encoding: "utf-8",
  });

  const metadataFile = files.find(
    (file) => file === "metadata.json" || file === "metadata.txt"
  );
  let metadata: MetadataStandard | undefined = undefined;
  if (metadataFile === "metadata.json") {
    metadata = await scnexusMetaFileParser(join(campaignRoot, metadataFile));
  } else if (metadataFile === "metadata.txt") {
    metadata = await ccmMetaFileParser(join(campaignRoot, metadataFile));
  } else {
    return;
  }

  if (
    !metadata ||
    metadata.type !== "Campaign" ||
    metadata.campaign !== campaignType
  ) {
    return;
  }

  let total_size: number = 0;
  let total_count: number = 0;

  if (campaignType === "WOL") {
    const { files_count, files_size } = await countPathCompatible(
      campaignRoot,
      ["nova", "swarm", "void", "voidprologue"]
    );
    total_size += files_size;
    total_count += files_count;
  } else if (campaignType === "LOTV") {
    const { files_count: count_void, files_size: size_void } =
      await countPathCompatible(campaignRoot);
    total_size += size_void;
    total_count += count_void;
    const { files_count: count_prologue, files_size: size_prologue } =
      await countPathCompatible(join(campaignRoot, "..", "voidprologue"));
    total_size += size_prologue;
    total_count += count_prologue;
  } else {
    const { files_count, files_size } = await countPathCompatible(campaignRoot);
    total_size += files_size;
    total_count += files_count;
  }

  const infor: MetadataInformated = {
    ...metadata,
    localinfo: {
      metadata_path: campaignRoot,
      files_size: total_size,
      files_count: total_count,
    },
  };

  return infor;
}

export async function updateActivedCampaignSet(): Promise<CampaignActiveStore> {
  const campaigns = ["WOL", "HOTS", "LOTV", "NCO"] as CampaignType[];
  const metadatas: MetadataInformatedCampaignSet = {
    WOL: undefined,
    HOTS: undefined,
    LOTV: undefined,
    NCO: undefined,
  };
  for (const campaign of campaigns) {
    metadatas[campaign] = await ActiveCampaignSearcher(campaign);
  }
  return updateCampaignActiveStore(metadatas);
}

/**
 * Retrieves the active campaign information set.
 *
 * @returns {CampaignActiveStore} The active campaign information set.
 */
export function getActivedCampaignList(): CampaignActiveStore {
  return getCampaignActiveStore();
}

export function getActivedCampaignTyped(
  type: CampaignType
): MetadataInformated | undefined {
  return getCampaignActiveStoreKey("CAMPAIGN_SET")[type];
}

export async function activeCampaign(infor: MetadataInformated) {
  if (infor.type !== "Campaign" || !infor.campaign) return;

  if (infor.manager === "SCNexus") {
    // Redundant operation: Clean Official Campaign maps files,
    // to make sure previous campaign package is removed correctly.
    await cleanActiveOfficialCampaignMapFiles(infor.campaign);

    // Redundant operation: Clean active same campaign package,
    // to make sure the override works correctly.
    await cleanCampaignFiles(infor);

    // Copyin campaign package files in due form.
    await copyinCampaignFiles(infor);

    insertStoreActiveCampaign(infor);
  } else if (infor.manager === "CCM") {
    // Redundant operation: Clean previous maps files,
    await cleanCampaignFilesCCM(infor);

    // Copyin campaign package files in due form.
    await copyinCampaignFilesCCM(infor);

    insertStoreActiveCampaign(infor);
  }
}

export async function unactiveCampaign(infor: MetadataInformated) {
  if (infor.type !== "Campaign" || !infor.campaign) return;

  if (infor.manager === "SCNexus") {
    await cleanCampaignFiles(infor);
  } else if (infor.manager === "CCM") {
    await cleanCampaignFilesCCM(infor);
  } else {
    return;
  }
  removeStoreActiveCampaign(infor);
}

export async function recoverCampaignType(campaign: CampaignType) {
  await cleanActiveOfficialCampaignMapFiles(campaign);
}
