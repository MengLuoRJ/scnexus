import { join, basename } from "node:path";
import { readdir, rename } from "node:fs/promises";

import { ResultUncompressCCM } from "@shared/types/campaign.type";
import {
  readCompressFileInfo,
  readCompressFileInfo7z,
} from "../customize/compress-process";
import { Logger } from "@electron/main/utils/logger";
import {
  INVALID_COMPRESSED_FILE,
  METADATA_NOT_FOUND,
  METHOD_CCM_ONLY,
  UNCOMPRESSING_ERROR,
} from "@shared/errors";
import { rmIfExist } from "@electron/main/utils/fs-util";
import { zip } from "compressing";
import { profileStore } from "@electron/main/stores/profile";
import { szExtractFullPromisify } from "@electron/main/utils/7zip-util";

export async function unzipCompressFileCCM(
  cf_path: string
): Promise<ResultUncompressCCM> {
  const cfi = readCompressFileInfo(cf_path);

  if (!cfi) {
    Logger.warn(`[CAMPAIGN] ${INVALID_COMPRESSED_FILE}: cf_path = ${cf_path}`);
    throw new Error(INVALID_COMPRESSED_FILE);
  }

  const { ccm, compress_info } = cfi;
  if (!ccm?.metadata) {
    Logger.warn(`[CAMPAIGN] ${METADATA_NOT_FOUND}: cf_path = ${cf_path}`);
    throw new Error(METADATA_NOT_FOUND);
  }
  if (ccm?.metadata.manager !== "CCM") {
    Logger.warn(`[CAMPAIGN] ${METHOD_CCM_ONLY}: cf_path = ${cf_path}`);
    throw new Error(METHOD_CCM_ONLY);
  }

  const storePath: string = profileStore.get("PROFILE_CAMPAIGN").CCM_ROOT;
  const tempPath = join(storePath, "~scnexus_ccm_uncompress_temp_dir");
  const targetPath = join(
    storePath,
    ccm?.metadata.name.replace(/[\~\!\@\#\$\%\^\&\*\"\|\:\<\>\/\\\\]/g, "")
  );

  await rmIfExist(targetPath);

  if (!ccm?.metadata_root) {
    await zip
      .uncompress(cf_path, targetPath, {
        zipFileNameEncoding: compress_info.fn_encoding ?? "utf8",
      })
      .catch((err) => {
        Logger.error(
          `[CAMPAIGN] ${UNCOMPRESSING_ERROR}: error = ${err}, cf_path = ${cf_path}, targetPath = ${targetPath}`
        );
        throw new Error(UNCOMPRESSING_ERROR);
      });
  } else {
    await rmIfExist(tempPath);
    await zip
      .uncompress(cf_path, tempPath, {
        zipFileNameEncoding: compress_info.fn_encoding ?? "utf8",
      })
      .catch((err) => {
        Logger.error(
          `[CAMPAIGN] ${UNCOMPRESSING_ERROR}: error = ${err}, cf_path = ${cf_path}, targetPath = ${targetPath}`
        );
        throw new Error(UNCOMPRESSING_ERROR);
      });

    await rename(join(tempPath, ccm.metadata_root, ".."), storePath);
    await rmIfExist(tempPath);
  }

  return {
    ccm: ccm,
    cf_path: cf_path,
    cf_info: cfi,
  };
}

export async function unzipCompressFileSimulateCCM(
  cf_path: string
): Promise<ResultUncompressCCM> {
  const cfi = readCompressFileInfo(cf_path);

  if (!cfi) {
    Logger.warn(`[CAMPAIGN] ${INVALID_COMPRESSED_FILE}: cf_path = ${cf_path}`);
    throw new Error(INVALID_COMPRESSED_FILE);
  }

  const { ccm, compress_info } = cfi;
  if (!ccm?.metadata) {
    Logger.warn(`[CAMPAIGN] ${METADATA_NOT_FOUND}: cf_path = ${cf_path}`);
    throw new Error(METADATA_NOT_FOUND);
  }

  if (ccm?.metadata.manager !== "CCM") {
    Logger.warn(`[CAMPAIGN] ${METHOD_CCM_ONLY}: cf_path = ${cf_path}`);
    throw new Error(METHOD_CCM_ONLY);
  }

  const targetPath = join(
    profileStore.get("PROFILE_CAMPAIGN").CCM_ROOT,
    basename(cf_path, ".zip")
  );

  await rmIfExist(targetPath);

  await zip
    .uncompress(cf_path, targetPath, {
      zipFileNameEncoding: compress_info.fn_encoding ?? "utf8",
    })
    .catch((err) => {
      Logger.error(
        `[CAMPAIGN] ${UNCOMPRESSING_ERROR}: error = ${err}, cf_path = ${cf_path}, targetPath = ${targetPath}`
      );
      throw new Error(UNCOMPRESSING_ERROR);
    });

  const modsPath: string = profileStore.get("PROFILE_CAMPAIGN").MODS_ROOT;

  const files = await readdir(targetPath, {
    encoding: "utf-8",
    recursive: true,
  });

  for (const file of files) {
    if (file.endsWith(".SC2Mod") || file.endsWith(".sc2mod")) {
      const dest = join(modsPath, basename(file));
      await rmIfExist(dest);
      await rename(join(targetPath, file), dest);
    }
  }

  return {
    ccm: ccm,
    cf_path: cf_path,
    cf_info: cfi,
  };
}

export async function unzipCompressFile7zSimulateCCM(
  cf_path: string
): Promise<ResultUncompressCCM> {
  const cfi = await readCompressFileInfo7z(cf_path);

  if (!cfi) {
    Logger.warn(`[CAMPAIGN] ${INVALID_COMPRESSED_FILE}: cf_path = ${cf_path}`);
    throw new Error(INVALID_COMPRESSED_FILE);
  }

  const { ccm, compress_info } = cfi;
  if (!ccm?.metadata) {
    Logger.warn(`[CAMPAIGN] ${METADATA_NOT_FOUND}: cf_path = ${cf_path}`);
    throw new Error(METADATA_NOT_FOUND);
  }

  if (ccm?.metadata.manager !== "CCM") {
    Logger.warn(`[CAMPAIGN] ${METHOD_CCM_ONLY}: cf_path = ${cf_path}`);
    throw new Error(METHOD_CCM_ONLY);
  }

  const targetPath = join(
    profileStore.get("PROFILE_CAMPAIGN").CCM_ROOT,
    basename(cf_path, ".zip")
  );

  await rmIfExist(targetPath);

  await szExtractFullPromisify(cf_path, targetPath).catch((err) => {
    Logger.error(
      `[CAMPAIGN] ${UNCOMPRESSING_ERROR}: error = ${err}, cf_path = ${cf_path}, targetPath = ${targetPath}`
    );
    throw new Error(UNCOMPRESSING_ERROR);
  });

  const modsPath: string = profileStore.get("PROFILE_CAMPAIGN").MODS_ROOT;

  const files = await readdir(targetPath, {
    encoding: "utf-8",
    recursive: true,
  });

  for (const file of files) {
    if (file.endsWith(".SC2Mod") || file.endsWith(".sc2mod")) {
      const dest = join(modsPath, basename(file));
      await rmIfExist(dest);
      await rename(join(targetPath, file), dest);
    }
  }

  return {
    ccm: ccm,
    cf_path: cf_path,
    cf_info: cfi,
  };
}
