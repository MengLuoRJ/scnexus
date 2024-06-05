import {
  MetadataStandard,
  MetadataInformated,
  MetadataInformatedList,
} from "scnexus-standard/metadata";
import { join } from "node:path";
import { rm, cp, readdir, stat } from "node:fs/promises";

import {
  ResultInstallCustomize,
  ResultUninstallCustomize,
} from "@shared/types/customize.type";

import {
  getCustomizeStore,
  insertStoreCustomize,
  removeStoreCustomize,
  updateCustomizeStore,
} from "@electron/main/stores/customize";
import { Logger } from "@electron/main/utils/logger";
import {
  FILES_COPY_ERROR,
  FILES_REMOVE_ERROR,
  METADATA_INFORMATED_INCOMPLETE,
  METHOD_TYPE_UNSUPPORTED,
} from "@shared/errors/customize.error";
import {
  countPathCompatible,
  mkdirIfNotExist,
  rmIfExist,
} from "@electron/main/utils/fs-util";
import { scnexusMetaFileParser } from "./customize-util";
import { profileStore } from "@electron/main/stores/profile";

export async function installCustomize(
  infor: MetadataInformated
): Promise<ResultInstallCustomize> {
  if (infor.type !== "Customize") {
    Logger.warn(
      `[CUSTOMIZE] ${METHOD_TYPE_UNSUPPORTED}: method = installCustomize, type = ${infor.type}`
    );
    throw new Error(METHOD_TYPE_UNSUPPORTED);
  }

  if (!infor.localinfo || !infor.localinfo.metadata_path) {
    Logger.warn(
      `[CUSTOMIZE] ${METADATA_INFORMATED_INCOMPLETE}: method = installCustomize, type = ${infor.type}`
    );
    throw new Error(METADATA_INFORMATED_INCOMPLETE);
  }

  const sourceRoot = join(infor.localinfo.metadata_path, "..");
  const sourceModsRoot = join(sourceRoot, "Mods", infor.mods_directory!);
  const sourceMapsRoot = join(sourceRoot, "Maps", infor.maps_directory!);

  const targetModsRoot = join(
    profileStore.get("PROFILE_CUSTOMIZE").MODS_ROOT,
    infor.mods_directory!
  );
  await mkdirIfNotExist(targetModsRoot);

  const targetMapsRoot = join(
    profileStore.get("PROFILE_CUSTOMIZE").MAPS_ROOT,
    infor.maps_directory!
  );
  await mkdirIfNotExist(targetMapsRoot);

  try {
    await cp(sourceModsRoot, targetModsRoot);
    await cp(sourceMapsRoot, targetMapsRoot);
  } catch (error) {
    Logger.error(
      `[CUSTOMIZE] ${FILES_COPY_ERROR}: method = installCustomize, error = ${
        (error as Error).message
      }`
    );
    throw new Error(FILES_COPY_ERROR);
  }

  try {
    await rm(join(sourceModsRoot, ".."), { recursive: true });
    await rm(join(sourceMapsRoot, ".."), { recursive: true });
  } catch (error) {
    Logger.error(
      `[CUSTOMIZE] ${FILES_REMOVE_ERROR}: method = installCustomize, error = ${
        (error as Error).message
      }`
    );
    throw new Error(FILES_REMOVE_ERROR);
  }

  insertStoreCustomize(infor);

  return {
    infor: infor,
  };
}

export async function uninstallCustomize(
  infor: MetadataInformated
): Promise<ResultUninstallCustomize> {
  if (infor.type !== "Customize") {
    Logger.warn(
      `[CUSTOMIZE] ${METHOD_TYPE_UNSUPPORTED}: method = uninstallCustomize, type = ${infor.type}`
    );
    throw new Error(METHOD_TYPE_UNSUPPORTED);
  }

  if (!infor.localinfo || !infor.localinfo.metadata_path) {
    Logger.warn(
      `[CUSTOMIZE] ${METADATA_INFORMATED_INCOMPLETE}: method = uninstallCustomize, type = ${infor.type}`
    );
    throw new Error(METADATA_INFORMATED_INCOMPLETE);
  }

  const sourceRoot = join(infor.localinfo.metadata_path, "..");

  const installedModsRoot = join(
    profileStore.get("PROFILE_CUSTOMIZE").MODS_ROOT,
    infor.mods_directory!
  );

  const installedMapsRoot = join(
    profileStore.get("PROFILE_CUSTOMIZE").MAPS_ROOT,
    infor.maps_directory!
  );

  try {
    await rmIfExist(installedModsRoot);
    await rmIfExist(installedMapsRoot);
    await rmIfExist(sourceRoot, { recursive: true });
  } catch (error) {
    Logger.error(
      `[CUSTOMIZE] ${FILES_REMOVE_ERROR}: method = uninstallCustomize, error = ${
        (error as Error).message
      }`
    );
    throw new Error(FILES_REMOVE_ERROR);
  }

  removeStoreCustomize(infor);

  return {
    infor: infor,
  };
}

export function getInstalledCustomizeList() {
  return getCustomizeStore();
}

export async function scanInstalledCustomizeList() {
  const customizeList: MetadataInformatedList = [];
  const customizeLibraryRoot = profileStore.get("PROFILE_CUSTOMIZE").LIBRARY_ROOT;

  const dirs = await readdir(customizeLibraryRoot, { encoding: "utf-8" });
  for (const dir of dirs) {
    const dirStat = await stat(join(customizeLibraryRoot, dir));
    if (!dirStat.isDirectory()) continue;
    const metadata: MetadataStandard = await scnexusMetaFileParser(
      join(customizeLibraryRoot, dir, "metadata.json")
    );
    if (!metadata) continue;
    const { files_count, files_size } = await countPathCompatible(
      join(customizeLibraryRoot, dir)
    );
    customizeList.push({
      ...metadata,
      localinfo: {
        metadata_path: join(customizeLibraryRoot, dir, "metadata.json"),
        files_count: files_count,
        files_size: files_size,
      },
    });
  }

  return updateCustomizeStore(customizeList);
}
