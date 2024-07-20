import { join, dirname, basename } from "node:path";
import { existsSync, renameSync, rmSync, mkdirSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";

import { Logger } from "@electron/main/utils/logger";

import AdmZip, { IZipEntry } from "adm-zip";
import { getZip } from "@electron/main/utils/admzip";

import { zip } from "compressing";
import { analyse } from "chardet";

import { MetadataStandard } from "scnexus-standard/metadata";
import {
  ccmMetadataParser,
  generateZipEntryTree,
  generateZipEntryInfo7z,
  scnexusMetadataParser,
} from "./customize-util";

import {
  CompressFileInfo,
  ResultUncompress,
  ResultUnzipFile,
} from "@shared/types/customize.type";
import {
  INVALID_COMPRESSED_FILE,
  METADATA_NOT_FOUND,
  METHOD_SCNEXUS_ONLY,
  METHOD_TYPE_UNSUPPORTED,
  UNCOMPRESSING_ERROR,
} from "@shared/errors/customize.error";
import { profileStore } from "@electron/main/stores/profile";
import { szList } from "@electron/main/utils/7zip";
import {
  szExtractFullPromisify,
  szListFull,
  szReadFile,
} from "@electron/main/utils/7zip-util";

export function readCompressFileInfo(cf_path: string): CompressFileInfo | null {
  let zip: AdmZip;
  try {
    zip = getZip(cf_path);
  } catch (err) {
    Logger.error(err);
    return null;
  }

  let metadataEntry: IZipEntry | undefined;

  let metadata: MetadataStandard | undefined;

  let ccmMetadata: MetadataStandard | undefined;
  let ccmMetadataRoot: string | undefined;

  metadataEntry = zip
    .getEntries()
    .find((entry) => entry.entryName === "metadata.json");
  if (metadataEntry) {
    const data = metadataEntry.getData().toString();
    metadata = scnexusMetadataParser(data);
  }

  metadataEntry = zip
    .getEntries()
    .find((entry) => entry.name === "metadata.json");
  if (metadataEntry) {
    const data = metadataEntry.getData().toString();
    ccmMetadata = scnexusMetadataParser(data);
    ccmMetadataRoot = metadataEntry.entryName.split(metadataEntry.name)[0];
  }

  metadataEntry = zip
    .getEntries()
    .find((entry) => entry.name === "metadata.txt");
  if (metadataEntry) {
    const data = metadataEntry.getData().toString();
    ccmMetadata = ccmMetadataParser(data);
    ccmMetadataRoot = metadataEntry.entryName.split(metadataEntry.name)[0];
  }

  if (!metadata && !ccmMetadata) {
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
        if (ccmMetadataRoot && metadataEntry) {
          ccmMetadataRoot = new TextDecoder("gb18030").decode(
            metadataEntry.rawEntryName
          );
        }
      }
    }
  });

  const entry_tree = generateZipEntryTree(cf_path);

  return {
    metadata: metadata,
    ccm: {
      metadata: ccmMetadata,
      metadata_root: ccmMetadataRoot,
    },
    compress_info: {
      size: size,
      size_compressed: compressedSize,
      files_count: zip.getEntryCount(),
      fn_encoding: fn_encoding,
    },
    entry_tree: entry_tree ?? undefined,
  };
}

export async function readCompressFileInfo7z(
  cf_path: string
): Promise<CompressFileInfo | null> {
  let metadata: MetadataStandard | undefined;

  let ccmMetadata: MetadataStandard | undefined;
  let ccmMetadataRoot: string | undefined;

  let size: number = 0;
  let compressedSize: number = 0;
  let files_count: number = 0;

  let fn_encoding: string = "utf8";

  let promiseList: Promise<void>[] = [];
  const result = await new Promise<boolean>((resolve, reject) =>
    szList(cf_path, { charset: "UTF-8" })
      .on("data", async (data) => {
        const dataProcessPromise = async () => {
          if (fn_encoding === "utf8") {
            const encoding = analyse(Buffer.from(data.file));
            if (
              encoding.some((result) => {
                return (
                  (result.name === "GB18030" || result.lang === "zh") &&
                  result.confidence >= 10
                );
              })
            ) {
              fn_encoding = "gb18030";
            }
          }
          const name = basename(data.file);
          if (name === "metadata.json") {
            console.log("metadata.json");
            const buffer = await szReadFile(cf_path, name);
            metadata = scnexusMetadataParser(buffer.toString());
          }
          if (name === "metadata.txt") {
            console.log("metadata.txt");
            const buffer = await szReadFile(cf_path, name);
            ccmMetadata = ccmMetadataParser(buffer.toString());
            ccmMetadataRoot = dirname(data.file);
          }
          files_count += 1;
          size += data?.size ?? 0;
          compressedSize += data?.sizeCompressed ?? 0;
        };
        promiseList.push(dataProcessPromise());
      })
      .on("end", () => {
        resolve(true);
      })
      .on("error", (e) => {
        console.error(e);
        Logger.error(e);
        reject(e);
      })
  );

  if (!result) return null;
  await Promise.all(promiseList);
  const { cfList, cfTree } = await generateZipEntryInfo7z(cf_path);

  return {
    metadata: metadata,
    ccm: {
      metadata: ccmMetadata,
      metadata_root: ccmMetadataRoot,
    },
    compress_info: {
      size: size,
      size_compressed: compressedSize,
      files_count: files_count,
      fn_encoding: fn_encoding,
    },
    entry_tree: cfTree ?? undefined,
    entry_list: cfList ?? undefined,
  };
}

/**
 * Install Compress file, this will uncompress the zip file.
 * @param path Path to Compress file
 * @returns
 */
export async function installCompressFile(
  cf_path: string
): Promise<ResultUncompress> {
  const cfi = readCompressFileInfo(cf_path);
  if (!cfi) {
    Logger.warn(`[CUSTOMIZE] ${INVALID_COMPRESSED_FILE}: cf_path = ${cf_path}`);
    throw new Error(INVALID_COMPRESSED_FILE);
  }

  const { metadata, compress_info } = cfi;
  if (!metadata) {
    Logger.warn(`[CUSTOMIZE] ${METADATA_NOT_FOUND}: cf_path = ${cf_path}`);
    throw new Error(METADATA_NOT_FOUND);
  }

  if (metadata.manager !== "SCNexus") {
    Logger.warn(`[CUSTOMIZE] ${METHOD_SCNEXUS_ONLY}: cf_path = ${cf_path}`);
    throw new Error(METHOD_SCNEXUS_ONLY);
  }

  let storePath: string = "";
  if (metadata.type === "Customize") {
    storePath = profileStore.get("PROFILE_CUSTOMIZE").LIBRARY_ROOT;
  } else if (metadata.type === "Campaign") {
    storePath = profileStore.get("PROFILE_CAMPAIGN").LIBRARY_ROOT;
  } else {
    Logger.warn(
      `[CUSTOMIZE] ${METHOD_TYPE_UNSUPPORTED}: type = ${metadata.type}, cf_path = ${cf_path}`
    );
    throw new Error(METHOD_TYPE_UNSUPPORTED);
  }

  const targetPath = join(
    storePath,
    metadata.name.replace(/[\~\!\@\#\$\%\^\&\*\"\|\:\<\>\/\\\\]/g, "")
  );

  await access(targetPath).catch(
    async () => await mkdir(targetPath, { recursive: true })
  );

  await zip
    .uncompress(cf_path, targetPath, {
      zipFileNameEncoding: compress_info.fn_encoding ?? "utf8",
    })
    .catch((err) => {
      Logger.error(
        `[CUSTOMIZE] ${UNCOMPRESSING_ERROR}: error = ${err}, cf_path = ${cf_path}, targetPath = ${targetPath}`
      );
      throw new Error(UNCOMPRESSING_ERROR);
    });

  return {
    metadata: metadata,
    cf_path: cf_path,
    cf_info: cfi,
  };
}

/**
 * Install Compress file, this will uncompress the zip file.
 * @param path Path to Compress file
 * @returns
 */
export async function installCompressFile7z(
  cf_path: string
): Promise<ResultUncompress> {
  const cfi = await readCompressFileInfo7z(cf_path);
  if (!cfi) {
    Logger.warn(`[CUSTOMIZE] ${INVALID_COMPRESSED_FILE}: cf_path = ${cf_path}`);
    throw new Error(INVALID_COMPRESSED_FILE);
  }

  const { metadata, compress_info } = cfi;
  if (!metadata) {
    Logger.warn(`[CUSTOMIZE] ${METADATA_NOT_FOUND}: cf_path = ${cf_path}`);
    throw new Error(METADATA_NOT_FOUND);
  }

  if (metadata.manager !== "SCNexus") {
    Logger.warn(`[CUSTOMIZE] ${METHOD_SCNEXUS_ONLY}: cf_path = ${cf_path}`);
    throw new Error(METHOD_SCNEXUS_ONLY);
  }

  let storePath: string = "";
  if (metadata.type === "Customize") {
    storePath = profileStore.get("PROFILE_CUSTOMIZE").LIBRARY_ROOT;
  } else if (metadata.type === "Campaign") {
    storePath = profileStore.get("PROFILE_CAMPAIGN").LIBRARY_ROOT;
  } else {
    Logger.warn(
      `[CUSTOMIZE] ${METHOD_TYPE_UNSUPPORTED}: type = ${metadata.type}, cf_path = ${cf_path}`
    );
    throw new Error(METHOD_TYPE_UNSUPPORTED);
  }

  const targetPath = join(
    storePath,
    metadata.name.replace(/[\~\!\@\#\$\%\^\&\*\"\|\:\<\>\/\\\\]/g, "")
  );

  await access(targetPath).catch(
    async () => await mkdir(targetPath, { recursive: true })
  );

  await szExtractFullPromisify(cf_path, targetPath).catch((err) => {
    Logger.error(
      `[CUSTOMIZE] ${UNCOMPRESSING_ERROR}: error = ${err}, cf_path = ${cf_path}, targetPath = ${targetPath}`
    );
    throw new Error(UNCOMPRESSING_ERROR);
  });

  return {
    metadata: metadata,
    cf_path: cf_path,
    cf_info: cfi,
  };
}

export async function validateCompressFile(path: string) {}

/**
 * read metadata from zip file
 * @deprecated use {readCompressFileInfo} instead
 */
export function readMetadataFromZipFiles(
  path: string
): MetadataStandard | undefined {
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

/**
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
  let storePath: string = profileStore.get("PROFILE_CAMPAIGN").LIBRARY_ROOT;
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
 * @deprecated
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
//     storePath = profileStore.get("PROFILE_CUSTOMIZE").LIBRARY_ROOT;
//   } else if (metadata.type === "Campaign") {
//     storePath = profileStore.get("PROFILE_CAMPAIGN").LIBRARY_ROOT;
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
//           mapsRoot += profileStore.get("PROFILE_CAMPAIGN").MAPS_ROOT;

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
//   const modsRoot = profileStore.get("PROFILE_CAMPAIGN").MODS_ROOT;
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
