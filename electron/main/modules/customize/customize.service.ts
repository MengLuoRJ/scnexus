import { CustomizeInformation } from "./../../../../shared/types";
import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  cpSync,
  copyFileSync,
} from "node:fs";
import { execFile } from "child_process";
import { getZip } from "@electron/main/utils/admzip";
import {
  CampaignType,
  Metadata,
  MetadataCampaign,
  MetadataCustomize,
} from "@shared/types";
import {
  CompressFileInfo,
  METADATA_NOT_FOUND,
  ResultUncompress,
  ResultUnzipFile,
} from "@shared/types/customize";
import { getProfileKey } from "@electron/main/stores/profile";
import { zip } from "compressing";
import { insertCustomize } from "@electron/main/stores/customize";
import { insertCampaign } from "@electron/main/stores/campaign";
import { getCustomizeActiveStoreKey } from "@electron/main/stores/customize-active";
import { gte } from "semver";
import { detect, analyse } from "chardet";
import AdmZip from "adm-zip";
import { Logger } from "@electron/main/utils/logger";

function initSCNexusCustomizeDirectory(): void {
  const customizePaths = getProfileKey("PROFILE_CUSTOMIZE");
  const scnexusRoot = join(customizePaths.LIBRARY_ROOT);
  if (scnexusRoot) {
    if (!existsSync(scnexusRoot)) {
      mkdirSync(scnexusRoot, { recursive: true });
    }
  }
}

export function initSCNexusCampaignDirectory(): void {
  const customizePaths = getProfileKey("PROFILE_CAMPAIGN");
  const scnexusRoot = join(customizePaths.LIBRARY_ROOT);
  if (scnexusRoot) {
    if (!existsSync(scnexusRoot)) {
      mkdirSync(scnexusRoot, { recursive: true });
    }
  }
}

export function initCustomizeService(): void {
  initSCNexusCustomizeDirectory();
  initSCNexusCampaignDirectory();
}

/**
 * Parse the metadata from file to a Standard Metadata object
 * @param data Metadata string from SCNexus metadata file
 * @returns `Metadata`
 */
export function scnexusMetadataParser(data: string): Metadata {
  let metadata: Metadata;
  metadata = { ...JSON.parse(data), manager: "SCNexus" };
  return metadata;
}

/**
 * This function will help parse the metadata from a CCM file to a Standard Metadata object
 * @warn CCM Standard is now only support Campaign type
 * @param data Metadata string from CCM metadata file
 * @returns `Metadata`
 */
export function ccmMetadataParser(data: string): MetadataCampaign {
  let metadata: MetadataCampaign = {
    name: "",
    description: "",
    author: "",
    type: "Campaign", // CCM Metadata only available in Camapign packages
    campaign: "" as CampaignType,
    campaign_bank: "offcial",
    version: "",
    dependencies: undefined,
    manager: "CCM",
  };
  for (const line of data.split(/\r?\n/)) {
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
          metadata.campaign = lineData[1].toUpperCase() as CampaignType;
          break;
        case "version":
          metadata.version = lineData[1];
          break;
      }
    }
  }
  return metadata;
}

export function scnexusMetaFileParser(path: string): Metadata {
  let metadata: Metadata;
  const metafile = readFileSync(path, "utf8");
  metadata = scnexusMetadataParser(metafile);
  return metadata;
}

export function ccmMetaFileParser(path: string): MetadataCampaign {
  let metadata: MetadataCampaign;
  const metafile = readFileSync(path, "utf8");
  metadata = ccmMetadataParser(metafile);
  return metadata;
}

/**
 * read metadata from zip file
 * @deprecated use {readCompressFileInfo} instead
 */
export function readMetadataFromZipFiles(path: string): Metadata | undefined {
  const zip = getZip(path);
  const file = zip.getEntries().find((entry) => {
    return entry.name === "metadata.json" || entry.name === "metadata.txt";
  });

  if (!file) {
    return undefined;
  }

  const data = file.getData().toString();

  if (file.name === "metadata.json") {
    return scnexusMetadataParser(data);
  } else if (file.name === "metadata.txt") {
    return ccmMetadataParser(data);
  } else {
    return undefined;
  }
}

export function readCompressFileInfo(
  path: string,
  options?: {
    tolerance?: boolean;
  }
): CompressFileInfo | null {
  let zip: AdmZip;
  try {
    zip = getZip(path);
  } catch (e) {
    Logger.error(e);
    return null;
  }

  let fileRoot: string;
  const metadataFile = zip.getEntries().find((entry) => {
    if (options?.tolerance)
      return entry.name === "metadata.json" || entry.name === "metadata.txt";
    return (
      entry.entryName === "metadata.json" || entry.entryName === "metadata.txt"
    );
  });

  if (!metadataFile) return null;
  if (options?.tolerance)
    fileRoot = metadataFile.entryName.split(metadataFile.name)[0];

  const data = metadataFile.getData().toString();
  let metadata: Metadata;
  if (metadataFile.name === "metadata.json") {
    metadata = scnexusMetadataParser(data);
  } else if (metadataFile.name === "metadata.txt") {
    metadata = ccmMetadataParser(data);
  } else {
    return null;
  }

  let size: number = 0;
  let compressedSize: number = 0;
  let fn_encoding: string = "utf8";
  zip.getEntries().map((entry) => {
    size += entry.header.size;
    compressedSize += entry.header.compressedSize;
    // if (entry.entryName.search(/\p{sc=Han}/gu) > -1) fn_encoding = "gb18030";

    if (fn_encoding === "utf8") {
      const encoding = analyse(entry.rawEntryName);
      if (
        encoding.some((result) => {
          return (
            (result.name === "GB18030" || result.lang === "zh") &&
            result.confidence >= 10
          );
        })
      ) {
        fn_encoding = "gb18030";
        fileRoot = new TextDecoder("gb18030").decode(metadataFile.rawEntryName);
      }
    }
  });

  return {
    metadata: metadata,
    compress_info: {
      size: size,
      compressed_size: compressedSize,
      file_count: zip.getEntryCount(),
      fn_encoding: fn_encoding,
    },
    tolerance: options?.tolerance ? options?.tolerance : undefined,
    metadata_root: options?.tolerance ? fileRoot! : undefined,
  };
}

/**
 * Install Compress file, this will uncompress the zip file.
 * @param path Path to Compress file
 * @returns
 */
export async function installCompressFile(
  path: string
): Promise<ResultUncompress> {
  const cfi = readCompressFileInfo(path);
  if (!cfi) {
    return {
      success: false,
      error: METADATA_NOT_FOUND,
    };
  }

  const { metadata, compress_info } = cfi;

  if (metadata.manager !== "SCNexus") {
    return {
      success: false,
      error: "This method only support SCNexus Pacakage",
    };
  }

  let storePath: string;
  if (metadata.type === "Customize") {
    storePath = getProfileKey("PROFILE_CUSTOMIZE").LIBRARY_ROOT;
  } else if (metadata.type === "Campaign") {
    storePath = getProfileKey("PROFILE_CAMPAIGN").LIBRARY_ROOT;
  } else {
    return {
      success: false,
      error: "Unknown metadata type",
    };
  }

  const dirName = metadata.name.replace(
    /[\~\!\@\#\$\%\^\&\*\"\|\:\<\>\/\\\\]/g,
    ""
  );
  await zip
    .uncompress(path, join(storePath, dirName), {
      zipFileNameEncoding: compress_info.fn_encoding ?? "utf8",
    })
    .catch((err) => {
      console.warn(err);
      return {
        success: false,
        error: err,
      };
    });

  if (metadata.type === "Customize") {
    insertCustomize({
      ...(metadata as MetadataCustomize),
      local: {
        metadata_path: join(storePath, dirName),
        total_size: compress_info.size,
        file_count: compress_info.file_count,
      },
    });
  } else if (metadata.type === "Campaign") {
    insertCampaign({
      ...(metadata as MetadataCampaign),
      local: {
        metadata_path: join(storePath, dirName),
        total_size: compress_info.size,
        file_count: compress_info.file_count,
      },
    });
  }

  return {
    success: true,
    metadata: metadata,
    info: {
      file_path: path,
      uncompress_path: join(storePath, dirName),
    },
  };
}

/**
 *
 * @param path
 * @returns
 * @deprecated
 */
export function unzipFileSimply(path: string): ResultUnzipFile {
  const metadata = readMetadataFromZipFiles(path);
  if (!metadata)
    return {
      success: false,
      error: METADATA_NOT_FOUND,
    };

  if (metadata.manager !== "CCM")
    return {
      success: false,
      error: "This method only support CCM Campaign Pacakage",
    };

  if (metadata.type !== "Campaign")
    return {
      success: false,
      error: "This method only support Campign type metadata.",
    };

  const zip = getZip(path);
  const metadataFile = zip.getEntries().find((entry) => {
    return entry.name === "metadata.txt";
  });
  if (!metadataFile) {
    return {
      success: false,
      error: METADATA_NOT_FOUND,
    };
  }
  const fileRoot = metadataFile.entryName.split(metadataFile.name)[0];
  let storePath: string = getProfileKey("PROFILE_CAMPAIGN").LIBRARY_ROOT;
  const dirName = metadata.name.replace(
    /[\~\!\@\#\$\%\^\&\*\"\|\:\<\>\/\\\\]/g,
    ""
  );
  if (!fileRoot) {
    storePath = join(storePath, dirName);
    mkdirSync(storePath, { recursive: true });
    zip.extractAllTo(storePath, true);
  } else {
    zip.extractAllTo(storePath, true);
    if (existsSync(join(storePath, dirName))) {
      rmSync(join(storePath, dirName), { recursive: true });
    }
    renameSync(join(storePath, fileRoot), join(storePath, dirName));
  }
  return {
    metadata,
    success: true,
    file_count: zip.getEntryCount(),
  };
}

/**
 *
 * @param path
 */
export async function unzipCompressFileSimply(path: string) {}

// /**
//  * unzipFiles function test 2
//  * @deprecated
//  */
// export function unzipFiles(path: string): ResultUnzipFile {
//   const metadata = readMetadataFromZipFiles(path);
//   if (!metadata) {
//     return {
//       success: false,
//       error: METADATA_NOT_FOUND,
//     };
//   }

//   const zip = getZip(path);
//   const metadataFile = zip.getEntries().find((entry) => {
//     return entry.name === "metadata.json" || entry.name === "metadata.txt";
//   });
//   if (!metadataFile) {
//     return {
//       success: false,
//       error: METADATA_NOT_FOUND,
//     };
//   }
//   const fileRoot = metadataFile.entryName.split(metadataFile.name)[0];

//   let storePath: string;
//   if (metadata.type === "Customize") {
//     storePath = getProfileKey("PROFILE_CUSTOMIZE").LIBRARY_ROOT;
//   } else if (metadata.type === "Campaign") {
//     storePath = getProfileKey("PROFILE_CAMPAIGN").LIBRARY_ROOT;
//   } else {
//     return {
//       success: false,
//       error: "Unknown metadata type",
//     };
//   }
//   storePath = join(
//     storePath,
//     metadata.name.replace(/[\~\!\@\#\$\%\^\&\*\"\|\:\<\>\/\\\\]/g, "")
//   );
//   mkdirSync(storePath, { recursive: true });
//   zip.extractEntryTo(metadataFile, storePath, false, true);
//   // process maps
//   if (metadata.maps) {
//     metadata.maps.forEach((map) => {
//       if (map.components) {
//         zip.extractEntryTo(
//           zip.getEntry(`${fileRoot}${map.name}/`)!,
//           storePath,
//           false,
//           true
//         );
//       } else {
//         zip.extractEntryTo(
//           zip.getEntry(`${fileRoot}${map.name}`)!,
//           storePath,
//           false,
//           true
//         );
//       }
//     });
//   } else {
//     zip.getEntries().forEach((entry) => {
//       if (entry.name.endsWith(".SC2Map")) {
//         zip.extractEntryTo(entry, storePath, false, true);
//       } else if (entry.isDirectory && entry.entryName.endsWith(".SC2Map/")) {
//         zip.extractEntryTo(entry, storePath, true, true);
//       }
//     });
//   }
//   // process dependencies
//   if (metadata.dependencies) {
//     metadata.dependencies.forEach((dependency) => {
//       if (dependency.components) {
//         zip.extractEntryTo(
//           zip.getEntry(`${fileRoot}${dependency.name}/`)!,
//           storePath,
//           false,
//           true
//         );
//       } else {
//         zip.extractEntryTo(
//           zip.getEntry(`${fileRoot}${dependency.name}`)!,
//           storePath,
//           false,
//           true
//         );
//       }
//     });
//   } else {
//     zip.getEntries().forEach((entry) => {
//       if (entry.name.endsWith(".SC2Mod")) {
//         zip.extractEntryTo(entry, storePath, false, true);
//       } else if (entry.isDirectory && entry.entryName.endsWith(".SC2Mod/")) {
//         zip.extractEntryTo(entry, storePath, true, true);
//       }
//     });
//   }
//   return {
//     metadata,
//     success: true,
//   };
// }

// /**
//  * unzipFiles function test 1
//  * @deprecated
//  */
// export function unzipFiles(path: string): ResultUnzipFile {
//   const metadata = readMetadataFromZipFiles(path);
//   if (!metadata) {
//     return {
//       success: false,
//       error: METADATA_NOT_FOUND,
//     };
//   }
//   const zip = getZip(path);
//   const files = [] as {
//     name: string;
//     path: string;
//   }[];
//   // process maps
//   if (metadata.maps) {
//   } else {
//     zip.getEntries().forEach((entry) => {
//       if (entry.name.endsWith(".SC2Map")) {
//         let mapsRoot: string;
//         if (metadata.type === "Customize") {
//         } else if (metadata.type === "Campaign") {
//           mapsRoot += getProfileKey("PROFILE_CAMPAIGN").MAPS_ROOT;

//           if (metadata.campaign === "LOTV") {

//           } else {

//           }
//         }

//         zip.extractEntryTo(entry, modsRoot, false, true);
//         files.push({
//           name: entry.name,
//           path: join(modsRoot, entry.name),
//         });
//       }
//     });
//   }
//   // process dependencies
//   const modsRoot = getProfileKey("PROFILE_CAMPAIGN").MODS_ROOT;
//   if (metadata.dependencies) {
//   } else {
//     zip.getEntries().forEach((entry) => {
//       if (entry.name.endsWith(".SC2Mod")) {
//         zip.extractEntryTo(entry, modsRoot, false, true);
//         files.push({
//           name: entry.name,
//           path: join(modsRoot, entry.name),
//         });
//       }
//     });
//   }
//   return {
//     metadata,
//     files,
//     success: true,
//   };
// }

export function activeCustomize(info: CustomizeInformation) {
  if (info.type !== "Customize" || !info.local || !info.local.metadata_path)
    return;
  const mapsRoot = getProfileKey("PROFILE_CUSTOMIZE").MAPS_ROOT;
  const modsRoot = getProfileKey("PROFILE_CUSTOMIZE").MODS_ROOT;

  const oldVersion = getCustomizeActiveStoreKey("CUSTOMIZE_LIST").find(
    (customize) => {
      customize.name === info.name && customize.snid === info.snid;
    }
  )?.version;

  if (oldVersion && gte(oldVersion, info.version)) return;

  const rootPath = join(info.local.metadata_path, "..");
  const files = readdirSync(rootPath, {
    withFileTypes: true,
    encoding: "utf-8",
    recursive: true,
  });

  info.dependencies?.forEach((dependency) => {
    // get dependency file
    const depfile = files.find((file) => {
      if (
        !dependency.components &&
        file.isFile() &&
        file.name === dependency.name
      ) {
        return true;
      } else if (
        dependency.components &&
        file.isDirectory() &&
        file.name === dependency.name
      ) {
        return true;
      } else {
        return false;
      }
    });

    if (!depfile) {
      // Dependency file not found
      return;
    }

    // compute source path
    const sourcePath = join(rootPath, depfile.name);

    // compute target path
    const targetPath = info.dependencies_directory
      ? join(modsRoot, info.dependencies_directory, dependency.name)
      : join(modsRoot, dependency.name);

    // excute file copy
    if (!existsSync(targetPath)) {
      copyFileSync(sourcePath, targetPath);
    }
  });
}

export function unactiveCustomize(info: CustomizeInformation) {}

export function uninstallCustomize(info: CustomizeInformation) {}

export function scanInstalledCusomize() {}

export function rmFilesFromDirSync(dirPath: string, exclude: string[] = []) {
  if (!existsSync(dirPath)) {
    return;
  }
  if (
    !getProfileKey("SUCCESS") ||
    !getProfileKey("PATH_WHITE_LIST")?.some((path) => dirPath.startsWith(path))
  ) {
    return;
  }
  const items = readdirSync(dirPath, {
    encoding: "utf-8",
    withFileTypes: true,
  });
  for (const file of items) {
    if (!exclude.includes(file.name) && existsSync(join(dirPath, file.name))) {
      rmSync(join(dirPath, file.name), { recursive: true });
    }
  }
}

export function rmDirSync(dirPath: string) {
  if (!existsSync(dirPath)) {
    return;
  }
  if (
    !getProfileKey("SUCCESS") ||
    !getProfileKey("PATH_WHITE_LIST")?.some((path) => dirPath.startsWith(path))
  ) {
    return;
  }
  rmSync(dirPath, { recursive: true });
}

export function runGameClient(path?: string) {
  const gameClientPath = getProfileKey("PROFILE_GAME").GAME_EXECUTABLE_X64;
  console.log(gameClientPath);
  if (!gameClientPath) return;
  if (path) {
  } else {
    console.log("run");
    execFile(gameClientPath);
  }
}

export function runEditorClient(path?: string) {
  const editorClientPath =
    getProfileKey("PROFILE_GAME").GAME_EDITOR_EXECUTABLE_X64;
  if (!editorClientPath) return;
  if (path) {
  } else {
    execFile(editorClientPath);
  }
}
