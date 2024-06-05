import { join } from "node:path";
import { readdir } from "node:fs/promises";

import {
  getCampaignStore,
  updateCampaignStore,
} from "@electron/main/stores/campaign";
import {
  CampaignType,
  MetadataInformated,
  MetadataInformatedCampaignListSet,
  MetadataInformatedList,
} from "scnexus-standard/metadata";

import {
  ccmMetaFileParser,
  rmDirWhitely,
  scnexusMetaFileParser,
} from "../customize/customize-util";
import { countPathCompatible } from "@electron/main/utils/fs-util";
import { profileStore } from "@electron/main/stores/profile";

async function CampaignListTypeSearcher(campaignType: CampaignType) {
  const campaignList: MetadataInformatedList = [];

  const campaignLibraryRoot = profileStore.get("PROFILE_CAMPAIGN").LIBRARY_ROOT;

  const dirs = await readdir(campaignLibraryRoot, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  for (const dir of dirs) {
    if (!dir.isDirectory()) return;

    const pathMetadata = join(campaignLibraryRoot, dir.name, "metadata.json");
    const metadata = await scnexusMetaFileParser(pathMetadata);
    if (
      !metadata ||
      metadata.type !== "Campaign" ||
      metadata.campaign !== campaignType
    ) {
      continue;
    }

    const { files_size, files_count } = await countPathCompatible(
      join(campaignLibraryRoot, dir.name)
    );

    const infor: MetadataInformated = {
      ...metadata,
      localinfo: {
        metadata_path: pathMetadata,
        files_count: files_count,
        files_size: files_size,
      },
    };
    campaignList.push(infor);
  }

  return campaignList;
}

async function CampaignListTypeSearcherCCM(
  campaignType: CampaignType
): Promise<MetadataInformatedList> {
  const ccmCampaignList: MetadataInformatedList = [];

  const ccmCampaignLibraryRoot = profileStore.get("PROFILE_CAMPAIGN").CCM_ROOT;

  const SearcherCCM = async (
    path: string
  ): Promise<MetadataInformated | undefined> => {
    const files = await readdir(path, {
      encoding: "utf-8",
      withFileTypes: true,
    });
    const metadataFile = files.find((file) => file.name === "metadata.txt");
    if (metadataFile) {
      const metadataFC = await ccmMetaFileParser(join(path, metadataFile.name));
      if (
        metadataFC &&
        metadataFC.type === "Campaign" &&
        metadataFC.campaign === campaignType
      ) {
        const { files_size, files_count } = await countPathCompatible(path);
        const infor: MetadataInformated = {
          ...metadataFC,
          localinfo: {
            metadata_path: join(path, metadataFile.name),
            files_count: files_count,
            files_size: files_size,
          },
        };
        return infor;
      }
    } else {
      for (const mayDir of files) {
        if (mayDir.isDirectory()) {
          return await SearcherCCM(join(path, mayDir.name));
        }
      }
    }
  };

  const dirs = await readdir(ccmCampaignLibraryRoot, {
    encoding: "utf-8",
    withFileTypes: true,
  });

  for (const dir of dirs) {
    if (dir.isDirectory()) {
      const infor = await SearcherCCM(join(ccmCampaignLibraryRoot, dir.name));
      if (infor) {
        ccmCampaignList.push(infor);
      }
    }
  }

  return ccmCampaignList;
}

export async function updateCampaignLists() {
  const campaignLists: MetadataInformatedCampaignListSet = {
    WOL: [],
    HOTS: [],
    LOTV: [],
    NCO: [],
  };

  const campigns = ["WOL", "HOTS", "LOTV", "NCO"] as CampaignType[];
  for (const campaign of campigns) {
    const campaignList = await CampaignListTypeSearcher(campaign);
    if (campaignList) {
      campaignLists[campaign].push(...campaignList);
    }

    const campaignListCCM = await CampaignListTypeSearcherCCM(campaign);
    if (campaignListCCM) {
      campaignLists[campaign].push(...campaignListCCM);
    }
  }

  const campainStoreData = updateCampaignStore(campaignLists);
  return campainStoreData;
}

export function getCampaignLists() {
  return getCampaignStore();
}

export async function uninstallCampiagnFiles(
  infor: MetadataInformated
): Promise<void> {
  if (!infor.localinfo.metadata_path) {
    return;
  }
  await rmDirWhitely(join(infor.localinfo.metadata_path, ".."));
}
