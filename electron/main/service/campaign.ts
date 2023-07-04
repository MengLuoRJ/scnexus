import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  cpSync,
} from "node:fs";
import { open } from "node:fs/promises";
import { getCampaignTypeRoot, getProfileKey } from "../stores/profile";
import {
  CampaignInformation,
  CampaignInformationList,
  CampaignMetadata,
  CampaignMetadataList,
  CampaignType,
} from "../types";
import { getCampaignStore, updateCampaignStore } from "../stores/campaign";
import { getZip } from "../utils/admzip";

function initCampaignDirectory(): void {
  const customizePaths = getProfileKey("PROFILE_CAMPAIGN");
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
}

function initSCNexusDirectory(): void {
  const customizePaths = getProfileKey("PROFILE_CAMPAIGN");
  const scnexusRoot = join(customizePaths.LIBRARY_ROOT);
  if (scnexusRoot) {
    if (!existsSync(scnexusRoot)) {
      mkdirSync(scnexusRoot, { recursive: true });
    }
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

export function initCampaign(): void {
  initCampaignDirectory();
  initSCNexusDirectory();
  initCCMDirectory();
}

async function scnexusMetaParser(
  metafilePath: string
): Promise<CampaignMetadata> {
  let metadata: CampaignMetadata = null;
  const metafile = readFileSync(metafilePath, "utf8");
  metadata = { ...JSON.parse(metafile) };
  return metadata;
}

async function ccmMetaParser(metafilePath: string): Promise<CampaignMetadata> {
  const metafile = await open(metafilePath, "r");
  let metadata: CampaignMetadata = {
    name: "",
    description: "",
    author: "",
    type: "" as CampaignType,
    version: "",
    dependencies: null as {
      name: string;
      description: string;
    }[],
  };
  for await (const line of metafile.readLines()) {
    const lineData = line?.split("=");
    if (lineData) {
      switch (lineData[0]) {
        case "title":
          metadata.name = lineData[1];
          break;
        case "desc":
          metadata.description = lineData[1];
          break;
        case "author":
          metadata.author = lineData[1];
          break;
        case "campaign":
          metadata.type = lineData[1].toUpperCase() as CampaignType;
          break;
        case "version":
          metadata.version = lineData[1];
          break;
      }
    }
  }
  return metadata;
}

export async function getActiveCampaignMetadataType(type: CampaignType) {
  const campaignTypeRoot = getCampaignTypeRoot(type);
  if (campaignTypeRoot) {
    const files = readdirSync(campaignTypeRoot);
    const scnexusMetafile = files.find((file) => file === "metadata.json");
    if (scnexusMetafile) {
      return scnexusMetaParser(join(campaignTypeRoot, scnexusMetafile));
    }
    const ccmMetafile = files.find((file) => file === "metadata.txt");
    if (ccmMetafile) {
      return ccmMetaParser(join(campaignTypeRoot, ccmMetafile));
    }
  }
  return null;
}

export async function getActiveCampaignMetadata(): Promise<CampaignMetadataList> {
  const metadatas: CampaignMetadataList = {
    WOL: null,
    HOTS: null,
    LOTV: null,
    NCO: null,
  };
  for (const key in metadatas) {
    metadatas[key] = await getActiveCampaignMetadataType(key as CampaignType);
  }
  return metadatas;
}

export async function updateCampaignLists() {
  const campaignLists: CampaignInformationList = {
    WOL: [],
    HOTS: [],
    LOTV: [],
    NCO: [],
  };
  // setup search function
  const metadataSearcher = async (
    path: string,
    parser: (
      metafilePath: string
    ) => Promise<CampaignMetadata> = scnexusMetaParser,
    fileName: string = "metadata.json",
    source?: string
  ) => {
    const items = readdirSync(path, {
      encoding: "utf-8",
      withFileTypes: true,
    });
    for (const item of items) {
      if (item.isFile() && item.name === fileName) {
        const metadata = await parser(join(path, item.name));
        campaignLists[metadata.type].push({
          ...metadata,
          path: join(path, item.name),
          source: source || undefined,
        });
        return;
      } else if (item.isDirectory()) {
        await metadataSearcher(join(path, item.name), parser, fileName, source);
      }
    }
  };
  // get campaign lists from scnexus
  const campaignLibraryRoot = getProfileKey("PROFILE_CAMPAIGN").LIBRARY_ROOT;
  const dirs = readdirSync(campaignLibraryRoot, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  // for (const dir of dirs) {
  //   if (dir.isDirectory()) {
  //     const files = readdirSync(join(campaignLibraryRoot, dir.name), {
  //       encoding: "utf-8",
  //     });
  //     const scnexusMetafile = files.find((file) => file === "metadata.json");
  //     if (scnexusMetafile) {
  //       const metadata = await scnexusMetaParser(
  //         join(campaignLibraryRoot, dir.name, "metadata.json")
  //       );
  //       campaignLists[metadata.type].push({
  //         ...metadata,
  //         path: join(campaignLibraryRoot, dir.name, scnexusMetafile),
  //       });
  //     }
  //     const ccmMetafile = files.find((file) => file === "metadata.txt");
  //     if (ccmMetafile) {
  //       const metadata = await ccmMetaParser(
  //         join(campaignLibraryRoot, dir.name, ccmMetafile)
  //       );
  //       campaignLists[metadata.type].push({
  //         ...metadata,
  //         path: join(campaignLibraryRoot, dir.name, "metadata.txt"),
  //       });
  //     }
  //   }
  // }
  for (const dir of dirs) {
    if (dir.isDirectory()) {
      await metadataSearcher(join(campaignLibraryRoot, dir.name));
      await metadataSearcher(
        join(campaignLibraryRoot, dir.name),
        ccmMetaParser,
        "metadata.txt",
        "CCM"
      );
    }
  }
  // get campaign lists from ccm, this would be deprecated in the future
  const ccmLiberyRoot = getProfileKey("PROFILE_CAMPAIGN").CCM_ROOT;
  const ccmDirs = readdirSync(ccmLiberyRoot, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  for (const dir of ccmDirs) {
    if (dir.isDirectory()) {
      await metadataSearcher(
        join(ccmLiberyRoot, dir.name),
        ccmMetaParser,
        "metadata.txt",
        "CCM"
      );
    }
  }
  // update campaign store
  const campainStoreData = updateCampaignStore(campaignLists);
  return campainStoreData;
}

export function getCampaignLists() {
  return getCampaignStore();
}

async function copyinCampaignFiles(camapignInformation: CampaignInformation) {
  const modsRoot = getProfileKey("PROFILE_CAMPAIGN").MODS_ROOT;
  const campaignFilesRoot = camapignInformation.path;
  const campaignTypeRoot = getCampaignTypeRoot(camapignInformation.type);
}

function rmFilesFromDirSync(dirPath: string, exclude: string[] = []) {
  const items = readdirSync(dirPath, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  for (const file of items) {
    if (!exclude.includes(file.name)) {
      rmSync(join(dirPath, file.name), { recursive: true });
    }
  }
}

export async function clearCampaignFiles(metadata: CampaignMetadata) {
  // clear campaign mode files
  const modsRoot = getProfileKey("PROFILE_CAMPAIGN").MODS_ROOT;
  // clear campaign map files
  switch (metadata.type) {
    case "WOL": {
      const campaignRoot = getCampaignTypeRoot(metadata.type);
      rmFilesFromDirSync(campaignRoot, [
        "swarm",
        "void",
        "voidprologue",
        "nova",
      ]);
      break;
    }
    case "HOTS": {
      const campaignRoot = getCampaignTypeRoot(metadata.type);
      rmFilesFromDirSync(campaignRoot, ["evolution"]);
      rmFilesFromDirSync(join(campaignRoot, "evolution"));
      break;
    }
    case "LOTV": {
      const campaignRoot = getCampaignTypeRoot(metadata.type);
      rmFilesFromDirSync(campaignRoot);
      rmFilesFromDirSync(join(campaignRoot, "..", "voidprologue"));
      break;
    }
    case "NCO": {
      const campaignRoot = getCampaignTypeRoot(metadata.type);
      rmFilesFromDirSync(campaignRoot);
      break;
    }
    default: {
      return;
    }
  }
}

export async function readMetadataFromZipCampaignFiles(path: string) {
  const zip = getZip(path);
  const metadata = zip.getEntry("metadata.json").getData().toString();
  if (!metadata) {
    const metadata = zip.getEntry("metadata.txt").getData().toString();
  }
}

export async function unzipCampaignFiles(path: string) {}
