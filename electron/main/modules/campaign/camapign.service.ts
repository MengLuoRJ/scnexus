import { join, basename } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  rmSync,
  cpSync,
  copyFileSync,
  renameSync,
} from "node:fs";
import {
  getCampaignTypeRoot,
  getProfileKey,
} from "@electron/main/stores/profile";
import {
  getCampaignStore,
  updateCampaignStore,
} from "@electron/main/stores/campaign";
import {
  CampaignInformation,
  CampaignInformationListSet,
  MetadataCampaign,
  CampaignType,
  CampaignInformationSet,
  Metadata,
} from "@shared/types";
import {
  ccmMetaFileParser,
  initSCNexusCampaignDirectory,
  readCompressFileInfo,
  rmDirSync,
  rmFilesFromDirSync,
  scnexusMetaFileParser,
} from "@electron/main/modules/customize/customize.service";
import { BrowserWindow } from "electron";
import {
  CampaignActiveStore,
  getCampaignActiveStore,
  getCampaignActiveStoreKey,
  insertActiveCampaign,
  removeActiveCampaign,
  updateCampaignActiveStore,
} from "@electron/main/stores/campaign-active";
import { METADATA_NOT_FOUND, ResultUncompress } from "@shared/types/customize";
import { zip } from "compressing";
import { Logger } from "@electron/main/utils/logger";

let window: BrowserWindow | null;

function initCampaignDirectory(): void {
  const customizePaths = getProfileKey("PROFILE_CAMPAIGN");
  try {
    // check if the Mods and Maps path exists, if not, create it
    if (customizePaths.MODS_ROOT) {
      const modsRoot = customizePaths.MODS_ROOT;
      if (!existsSync(modsRoot)) {
        mkdirSync(modsRoot, { recursive: true });
      }
    }
    if (customizePaths.MAPS_ROOT) {
      const mapsRoot = customizePaths.MAPS_ROOT;
      if (!existsSync(mapsRoot)) {
        mkdirSync(mapsRoot, { recursive: true });
      }
    }
    // check if the campaigns path exists, if not, create it
    if (customizePaths.WOL_ROOT) {
      const wolRoot = customizePaths.WOL_ROOT;
      if (!existsSync(wolRoot)) {
        mkdirSync(wolRoot, { recursive: true });
      }
    }
    if (customizePaths.HOTS_ROOT) {
      const hotsRoot = customizePaths.HOTS_ROOT;
      if (!existsSync(hotsRoot)) {
        mkdirSync(hotsRoot, { recursive: true });
      }
    }
    if (customizePaths.HOTS_EVO_ROOT) {
      const hotsEvoRoot = customizePaths.HOTS_EVO_ROOT;
      if (!existsSync(hotsEvoRoot)) {
        mkdirSync(hotsEvoRoot, { recursive: true });
      }
    }
    if (customizePaths.LOTV_ROOT) {
      const lotvRoot = customizePaths.LOTV_ROOT;
      if (!existsSync(lotvRoot)) {
        mkdirSync(lotvRoot, { recursive: true });
      }
    }
    if (customizePaths.LOTV_PRO_ROOT) {
      const lotvProRoot = customizePaths.LOTV_PRO_ROOT;
      if (!existsSync(lotvProRoot)) {
        mkdirSync(lotvProRoot, { recursive: true });
      }
    }
    if (customizePaths.NCO_ROOT) {
      const novaRoot = customizePaths.NCO_ROOT;
      if (!existsSync(novaRoot)) {
        mkdirSync(novaRoot, { recursive: true });
      }
    }
  } catch (error) {
    Logger.error(error);
  }
}

function initCCMDirectory(): void {
  const customizePaths = getProfileKey("PROFILE_CAMPAIGN");
  const ccmRoot = join(customizePaths.MAPS_ROOT, "CustomCampaigns");
  if (ccmRoot) {
    if (!existsSync(ccmRoot)) {
      mkdirSync(ccmRoot, { recursive: true });
    }
  }
}

export function initCampaignService(): void {
  initSCNexusCampaignDirectory();
  initCampaignDirectory();
  initCCMDirectory();
}

export async function unzipCompressFileCCM(
  path: string
): Promise<ResultUncompress> {
  const cfi = readCompressFileInfo(path, { tolerance: true });

  if (!cfi) {
    return {
      success: false,
      error: METADATA_NOT_FOUND,
    };
  }

  const { metadata, compress_info, metadata_root } = cfi;

  if (metadata.manager !== "CCM" || metadata.type !== "Campaign") {
    return {
      success: false,
      error: "This method only support CCM Campaign Pacakage",
    };
  }

  let storePath: string = getProfileKey("PROFILE_CAMPAIGN").CCM_ROOT;
  const tempPath = join(storePath, "~scnexus_ccm_uncompress_temp_dir");
  const dirName = metadata.name.replace(
    /[\~\!\@\#\$\%\^\&\*\"\|\:\<\>\/\\\\]/g,
    ""
  );
  storePath = join(storePath, dirName);

  try {
    if (existsSync(storePath)) {
      rmSync(storePath, { recursive: true });
    }
  } catch (error) {
    Logger.error(
      "CAMPAIGN_UNCOMPRESS_CCM: Failed to prepare store path",
      error
    );
    return {
      success: false,
      error: error as string,
    };
  }

  if (!metadata_root) {
    await zip
      .uncompress(path, storePath, {
        zipFileNameEncoding: compress_info.fn_encoding ?? "utf8",
      })
      .catch((err) => {
        Logger.error("CAMPAIGN_UNCOMPRESS_CCM: Uncompress failed", err);
        return {
          success: false,
          error: err,
        };
      });
  } else {
    if (!existsSync(tempPath)) mkdirSync(tempPath, { recursive: true });

    // console.log(metadata_root);
    // console.log(join(tempPath, metadata_root));
    // console.log(storePath);

    await zip
      .uncompress(path, tempPath, {
        zipFileNameEncoding: compress_info.fn_encoding ?? "utf8",
      })
      .catch((err) => {
        Logger.error("CAMPAIGN_UNCOMPRESS_CCM: Uncompress failed", err);
        return {
          success: false,
          error: err,
        };
      });

    try {
      renameSync(join(tempPath, metadata_root, ".."), storePath);
    } catch (error) {
      Logger.error(
        "CAMPAIGN_UNCOMPRESS_CCM: Failed to post process dirctory",
        error
      );
      return {
        success: false,
        error: error as string,
      };
    }

    // if (existsSync(tempPath)) rmSync(tempPath, { recursive: true });
  }

  return {
    metadata,
    success: true,
  };
}

function ActiveCampaignInformationSearcher(
  campaign: CampaignType
): CampaignInformation | undefined {
  const campaignRoot = getCampaignTypeRoot(campaign);

  if (!campaignRoot) return;

  const files = readdirSync(campaignRoot, {
    encoding: "utf-8",
  });

  let metadata: MetadataCampaign;
  let total_size = 0;
  let file_count = 0;

  const metadataFile = files.find(
    (file) => file === "metadata.json" || file === "metadata.txt"
  );

  if (!metadataFile) {
    return;
  } else if (metadataFile === "metadata.json") {
    const metadataFC = scnexusMetaFileParser(join(campaignRoot, metadataFile));
    if (metadataFC?.type === "Campaign" && metadataFC?.campaign === campaign) {
      metadata = metadataFC as MetadataCampaign;
    } else {
      return;
    }
  } else if (metadataFile === "metadata.txt") {
    const metadataFC = ccmMetaFileParser(join(campaignRoot, metadataFile));
    if (metadataFC?.type === "Campaign" && metadataFC?.campaign) {
      metadata = metadataFC;
    } else {
      return;
    }
  } else {
    return;
  }

  const PathCounter = (path: string) => {
    const filesFC = readdirSync(path, {
      encoding: "utf-8",
    });
    for (const file of filesFC) {
      const stat = statSync(join(path, file));
      if (stat.isDirectory()) {
        PathCounter(join(path, file));
      } else {
        file_count++;
        total_size += stat.size;
      }
    }
  };

  // count files and size of the files around the metadata file
  if (campaign === "WOL") {
    const filesFC = readdirSync(campaignRoot, {
      encoding: "utf-8",
      withFileTypes: true,
    });
    for (const file of filesFC) {
      if (
        file.isDirectory() &&
        !["nova", "swarm", "void", "voidprologue"].includes(file.name)
      ) {
        PathCounter(file.path);
      } else if (file.isFile()) {
        file_count++;
        total_size += statSync(join(file.path, file.name)).size;
      }
    }
  } else if (campaign === "LOTV") {
    PathCounter(join(campaignRoot));
    PathCounter(join(campaignRoot, "..", "voidprologue"));
  } else {
    PathCounter(campaignRoot);
  }

  return {
    ...metadata,
    local: {
      metadata_path: join(campaignRoot, metadataFile),
      total_size,
      file_count,
    },
  };
}

export function updateActiveCampaign(): CampaignActiveStore {
  const campaigns = ["WOL", "HOTS", "LOTV", "NCO"] as CampaignType[];
  const metadatas: CampaignInformationSet = {
    WOL: undefined,
    HOTS: undefined,
    LOTV: undefined,
    NCO: undefined,
  };
  for (const campaign of campaigns) {
    metadatas[campaign] = ActiveCampaignInformationSearcher(campaign);
  }
  return updateCampaignActiveStore(metadatas);
}

/**
 * @deprecated
 */
export function getActiveCampaignMetadataType(
  type: CampaignType
): CampaignInformation | undefined {
  const campaignTypeRoot = getCampaignTypeRoot(type);
  if (campaignTypeRoot) {
    const files = readdirSync(campaignTypeRoot);
    const scnexusMetafile = files.find((file) => file === "metadata.json");
    if (scnexusMetafile) {
      return {
        ...(scnexusMetaFileParser(
          join(campaignTypeRoot, scnexusMetafile)
        ) as MetadataCampaign),
        local: {
          metadata_path: join(campaignTypeRoot, scnexusMetafile),
        },
      };
    }
    const ccmMetafile = files.find((file) => file === "metadata.txt");
    if (ccmMetafile) {
      return {
        ...(ccmMetaFileParser(
          join(campaignTypeRoot, ccmMetafile)
        ) as MetadataCampaign),
        local: {
          metadata_path: join(campaignTypeRoot, ccmMetafile),
        },
      };
    }
  }
  return undefined;
}

/**
 * @deprecated
 */
export function getActiveCampaignMetadata(): CampaignInformationSet {
  const campigns = ["WOL", "HOTS", "LOTV", "NCO"] as CampaignType[];
  const metadatas: CampaignInformationSet = {
    WOL: undefined,
    HOTS: undefined,
    LOTV: undefined,
    NCO: undefined,
  };
  campigns.forEach(async (campaign) => {
    metadatas[campaign] = getActiveCampaignMetadataType(campaign);
  });
  return metadatas;
}

/**
 * Retrieves the active campaign information set.
 *
 * @returns {CampaignInformationSet} The active campaign information set.
 */
export function getActiveCampaign(): CampaignInformationSet {
  return getCampaignActiveStore().CAMPAIGN_SET;
}

export function getActiveCampaignType(
  campaign: CampaignType
): CampaignInformation | undefined {
  return getCampaignActiveStoreKey("CAMPAIGN_SET")[campaign];
}

function CamapignInformationListSetSearcher(
  campaign: CampaignType
): CampaignInformation[] {
  const campaignLists: CampaignInformation[] = [];
  const scnexusCampaignLibraryRoot =
    getProfileKey("PROFILE_CAMPAIGN").LIBRARY_ROOT;

  const PathSearcher = (
    path: string,
    manager: "SCNexus" | "CCM"
  ): CampaignInformation | undefined => {
    const files = readdirSync(path, {
      encoding: "utf-8",
    });

    let metadataFile: string | undefined;
    let metadata: MetadataCampaign;

    if (manager === "SCNexus") {
      metadataFile = files.find((file) => file === "metadata.json");
      if (metadataFile) {
        const metadataFC = scnexusMetaFileParser(join(path, metadataFile));
        if (
          metadataFC?.type === "Campaign" &&
          metadataFC?.campaign === campaign
        ) {
          metadata = metadataFC as MetadataCampaign;
        } else return;
      } else return;
    } else if (manager === "CCM") {
      metadataFile = files.find((file) => file === "metadata.txt");
      if (metadataFile) {
        const metadataFC = ccmMetaFileParser(join(path, metadataFile));
        if (
          metadataFC?.type === "Campaign" &&
          metadataFC?.campaign === campaign
        ) {
          metadata = metadataFC;
        } else return;
      } else {
        for (const file of files) {
          if (statSync(join(path, file)).isDirectory()) {
            const deepSearchResult = PathSearcher(join(path, file), "CCM");
            if (deepSearchResult) return deepSearchResult;
          }
        }
        return;
      }
    } else return;

    let total_size = 0;
    let file_count = 0;

    const PathCounter = (path: string) => {
      const filesFC = readdirSync(path, {
        encoding: "utf-8",
      });
      for (const file of filesFC) {
        const stat = statSync(join(path, file));
        if (stat.isDirectory()) {
          PathCounter(join(path, file));
        } else {
          file_count++;
          total_size += stat.size;
        }
      }
    };

    PathCounter(path);

    return {
      ...metadata,
      local: {
        metadata_path: join(path, metadataFile),
        total_size,
        file_count,
      },
    };
  };

  const scnexsuRootDirs = readdirSync(scnexusCampaignLibraryRoot, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  for (const dir of scnexsuRootDirs) {
    if (dir.isDirectory()) {
      const deepSearchResult = PathSearcher(
        join(scnexusCampaignLibraryRoot, dir.name),
        "SCNexus"
      );
      if (deepSearchResult) {
        campaignLists.push(deepSearchResult);
      }
    }
  }

  const ccmCampaignLibraryRoot = getProfileKey("PROFILE_CAMPAIGN").CCM_ROOT;

  const ccmRootDirs = readdirSync(ccmCampaignLibraryRoot, {
    encoding: "utf-8",
    withFileTypes: true,
  });

  for (const dir of ccmRootDirs) {
    if (dir.isDirectory()) {
      const deepSearchResult = PathSearcher(
        join(ccmCampaignLibraryRoot, dir.name),
        "CCM"
      );
      if (deepSearchResult) {
        campaignLists.push(deepSearchResult);
      }
    }
  }

  return campaignLists;
}

export function updateCampaignLists() {
  const campaignLists: CampaignInformationListSet = {
    WOL: [],
    HOTS: [],
    LOTV: [],
    NCO: [],
  };

  const campigns = ["WOL", "HOTS", "LOTV", "NCO"] as CampaignType[];
  campigns.forEach((campaign) => {
    const campaignList = CamapignInformationListSetSearcher(campaign);
    if (campaignList) {
      campaignLists[campaign] = campaignList;
    }
  });

  // update campaign store
  const campainStoreData = updateCampaignStore(campaignLists);
  return campainStoreData;
}

export function getCampaignLists() {
  return getCampaignStore();
}

export function activeCampaign(camapignInformation: CampaignInformation) {
  if (!camapignInformation.campaign) return;
  clearCampaignFiles(camapignInformation.campaign);
  removeActiveCampaign(camapignInformation);
  const copyinResult = copyinCampaignFiles(camapignInformation);
  if (copyinResult) {
    insertActiveCampaign(copyinResult);
  }
}

function copyinCampaignFiles(
  camapignInformation: CampaignInformation
): CampaignInformation | undefined {
  if (!camapignInformation.campaign || !camapignInformation.local.metadata_path)
    return;
  const modsRoot = getProfileKey("PROFILE_CAMPAIGN").MODS_ROOT;
  const campaignTypeRoot = getCampaignTypeRoot(camapignInformation.campaign);
  if (!campaignTypeRoot) return;

  const campaignFilesRoot = join(camapignInformation.local.metadata_path, "..");

  copyFileSync(
    camapignInformation.local.metadata_path,
    join(campaignTypeRoot, basename(camapignInformation.local.metadata_path))
  );

  const files = readdirSync(campaignFilesRoot, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  for (const file of files) {
    if (
      camapignInformation.campaign === "LOTV" &&
      file.name === "voidprologue"
    ) {
      cpSync(
        join(campaignFilesRoot, file.name),
        join(campaignTypeRoot, "..", "voidprologue"),
        {
          recursive: true,
        }
      );
    } else if (file.name.endsWith(".SC2Map")) {
      if (file.isDirectory()) {
        cpSync(
          join(campaignFilesRoot, file.name),
          join(campaignTypeRoot, file.name),
          {
            recursive: true,
          }
        );
      } else if (file.isFile()) {
        copyFileSync(
          join(campaignFilesRoot, file.name),
          join(campaignTypeRoot, file.name)
        );
      }
    } else if (file.name.endsWith(".SC2Mod")) {
      if (file.isDirectory()) {
        cpSync(join(campaignFilesRoot, file.name), join(modsRoot, file.name), {
          recursive: true,
        });
      } else if (file.isFile()) {
        copyFileSync(
          join(campaignFilesRoot, file.name),
          join(modsRoot, file.name)
        );
      }
    }
  }

  return {
    ...camapignInformation,
    local: {
      ...camapignInformation.local,
      metadata_path: join(
        campaignTypeRoot,
        basename(camapignInformation.local.metadata_path)
      ),
    },
  };
}

export function clearCampaignFiles(campaign: CampaignType) {
  // clear campaign mode files
  const modsRoot = getProfileKey("PROFILE_CAMPAIGN").MODS_ROOT;
  // clear campaign map files
  const campaignRoot = getCampaignTypeRoot(campaign);
  if (!campaignRoot) return;
  switch (campaign) {
    case "WOL": {
      rmFilesFromDirSync(campaignRoot, [
        "swarm",
        "void",
        "voidprologue",
        "nova",
      ]);
      break;
    }
    case "HOTS": {
      rmFilesFromDirSync(campaignRoot, ["evolution"]);
      rmFilesFromDirSync(join(campaignRoot, "evolution"));
      break;
    }
    case "LOTV": {
      rmFilesFromDirSync(campaignRoot);
      rmFilesFromDirSync(join(campaignRoot, "..", "voidprologue"));
      break;
    }
    case "NCO": {
      rmFilesFromDirSync(campaignRoot);
      break;
    }
    default: {
      return;
    }
  }
}

export function uninstallCampiagnFiles(
  campaignInformation: CampaignInformation
) {
  if (!campaignInformation.local.metadata_path) {
    return;
  }
  if (
    !getProfileKey("SUCCESS") ||
    !getProfileKey("PROFILE_CAMPAIGN").WOL_ROOT ||
    campaignInformation.local.metadata_path.startsWith(
      getProfileKey("PROFILE_CAMPAIGN").WOL_ROOT
    )
  ) {
    return;
  }
  rmDirSync(join(campaignInformation.local.metadata_path, ".."));
}
