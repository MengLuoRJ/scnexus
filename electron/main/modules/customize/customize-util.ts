import { exists } from "@electron/main/utils/fs-util";
import { join, basename } from "node:path";
import { readFile, access, readdir, rm } from "node:fs/promises";
import { CampaignType, MetadataStandard } from "scnexus-standard/metadata";
import { profileStore } from "@electron/main/stores/profile";
import AdmZip, { IZipEntry } from "adm-zip";
import { getZip } from "@electron/main/utils/admzip";
import { Logger } from "@electron/main/utils/logger";
import { CompressFileTree } from "@shared/types/customize.type";
import { szListFull } from "@electron/main/utils/7zip-util";

/**
 * Parse the metadata from file to a Standard Metadata object
 * @param data Metadata string from SCNexus metadata file
 * @returns `Metadata`
 */
export function scnexusMetadataParser(data: string): MetadataStandard {
  let metadata: MetadataStandard;
  metadata = {
    manager: "SCNexus",
    manager_mode: "standard",
    ...JSON.parse(data),
  };
  return metadata;
}

/**
 * This function will help parse the metadata from a CCM file to a Standard Metadata object
 * @warn CCM Standard is now only support Campaign type
 * @param data Metadata string from CCM metadata file
 * @returns `Metadata`
 */
export function ccmMetadataParser(data: string): MetadataStandard {
  let metadata: MetadataStandard = {
    name: "",
    description: "",
    author: "",
    type: "Campaign", // CCM Metadata only available in Camapign packages
    campaign: "" as CampaignType,
    bank_enable: "offcial",
    version: "",
    mods: undefined,
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

export async function scnexusMetaFileParser(
  path: string
): Promise<MetadataStandard> {
  const metafile = await readFile(path, { encoding: "utf8" });
  return scnexusMetadataParser(metafile);
}

export async function ccmMetaFileParser(
  path: string
): Promise<MetadataStandard> {
  const metafile = await readFile(path, { encoding: "utf8" });
  return ccmMetadataParser(metafile);
}

export function generateZipEntryTree(cf_path: string) {
  let zip: AdmZip;
  try {
    zip = getZip(cf_path);
  } catch (err) {
    Logger.error(err);
    return null;
  }

  const entries = zip.getEntries();

  const cfTree: CompressFileTree = {
    cf_path,
    name: basename(cf_path),
    root: {
      name: basename(cf_path),
      path: "/",
      isFile: false,
      isDirectory: true,
      children: [],
    },
  };

  for (const entry of entries) {
    let currentNode = cfTree.root;

    if (entry.name === "" || entry.isDirectory) {
      continue;
    }

    const segments = entry.entryName.split("/");
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      if (/\.sc2mod$|\.sc2map$/i.test(seg) && i < segments.length - 1) {
        if (
          currentNode.children?.findIndex(
            (node) => node.name === seg && node.isComponent
          ) === -1
        ) {
          currentNode.children.push({
            path: entry.entryName
              .split("/")
              .slice(0, i + 1)
              .join("/"),
            name: seg,
            isComponent: true,
            isDirectory: true,
            isFile: false,
          });
        }
        break;
      }

      if (i === segments.length - 1) {
        if (
          currentNode.children?.findIndex(
            (node) => node.name === seg && !node.isComponent
          ) === -1
        ) {
          currentNode.children?.push({
            path: entry.entryName,
            name: seg,
            isComponent: false,
            isDirectory: false,
            isFile: true,
          });
        }
      } else {
        let dirNode = currentNode.children?.find(
          (dir) => dir.isDirectory && dir.name === seg
        );
        if (!dirNode) {
          dirNode = {
            name: seg,
            path: segments.slice(0, i + 1).join("/"),
            children: [],
            isFile: false,
            isDirectory: true,
          };
          currentNode.children?.push(dirNode);
        }
        currentNode = dirNode;
      }
    }
  }

  return cfTree;
}

export async function generateZipEntryTree7z(cf_path: string) {
  const cfTree: CompressFileTree = {
    cf_path,
    name: basename(cf_path),
    root: {
      name: basename(cf_path),
      path: "/",
      isFile: false,
      isDirectory: true,
      children: [],
    },
  };

  const entries = await szListFull(cf_path);

  for (const entry of entries) {
    const fullPath = entry.file;

    let currentNode = cfTree.root;

    if (entry.attributes?.match(/D/)) {
      continue;
    }

    const segments = fullPath.split("/");
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      if (/\.sc2mod$|\.sc2map$/i.test(seg) && i < segments.length - 1) {
        if (
          currentNode.children?.findIndex(
            (node) => node.name === seg && node.isComponent
          ) === -1
        ) {
          currentNode.children.push({
            path: fullPath
              .split("/")
              .slice(0, i + 1)
              .join("/"),
            name: seg,
            isComponent: true,
            isFile: false,
            isDirectory: true,
          });
        }
        break;
      }

      if (i === segments.length - 1) {
        if (
          currentNode.children?.findIndex(
            (node) => node.name === seg && !node.isComponent
          ) === -1
        ) {
          currentNode.children.push({
            path: fullPath,
            name: seg,
            isComponent: false,
            isFile: true,
            isDirectory: false,
          });
        }
      } else {
        let dirNode = currentNode.children?.find(
          (dir) => dir.isDirectory && dir.name === seg
        );
        if (!dirNode) {
          dirNode = {
            name: seg,
            path: segments.slice(0, i + 1).join("/"),
            children: [],
            isFile: false,
            isDirectory: true,
          };
          currentNode.children?.push(dirNode);
        }
        currentNode = dirNode;
      }
    }
  }

  return cfTree;
}

export async function rmDirWhitely(dirPath: string) {
  const exist = await exists(dirPath);
  if (!exist) return;

  if (!profileStore.get("SUCCESS")) return;

  if (
    !profileStore
      .get("PATH_WHITE_LIST")
      ?.some((path) => dirPath.startsWith(path))
  ) {
    return;
  }

  await rm(dirPath, { recursive: true });
}

export async function rmFilesFromDirWhitely(
  dirPath: string,
  exclude: string[] = []
): Promise<void> {
  const exist = await exists(dirPath);
  if (!exist) return;

  if (!profileStore.get("SUCCESS")) return;

  if (
    !profileStore.get("PATH_WHITE_LIST")?.some((path) => {
      console.log(path, dirPath);
      return dirPath.startsWith(path);
    })
  ) {
    return;
  }

  const items = await readdir(dirPath, {
    encoding: "utf-8",
    withFileTypes: true,
  });

  for (const file of items) {
    if (!exclude.includes(file.name)) {
      await rm(join(dirPath, file.name), { recursive: true });
    }
  }
}
