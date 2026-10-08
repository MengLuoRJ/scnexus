import { normalizeError, ERRORS, toErrorDto } from "@scnexus/app-shared/errors/app.error";
import { getMainWindow } from "@/modules/window";
import { pipeline } from "node:stream";
import { createReadStream, createWriteStream, statSync } from "node:fs";
import { promisify } from "node:util";
import { MetadataStandard } from "scnexus-standard/metadata";
import { sevenZip } from "@/utils/7zip-wrapper";
import { mkdtemp, writeFile, copyFile, rename, rm } from "node:fs/promises";
import { dirname, join, basename } from "node:path";

import axios from "axios";

/**
 * Write standard Metadata to metadata.json file in given Compressed file.
 *
 * This will overwrite its content if the metadata.json file exists,
 * and will create new metadata.json file to write in if it doesn't exist.
 *
 * @param file_path path to the compressed file
 * @param metadata Metadata to write
 */
export async function writeMetadataToCompressedFile(
  file_path: string,
  metadata: MetadataStandard,
) {
  const temporary = await mkdtemp(
    join(dirname(file_path), ".scnexus-metadata-"),
  );
  const stagedArchive = join(temporary, basename(file_path));
  try {
    await copyFile(file_path, stagedArchive);
    const { entries } = await sevenZip.list(stagedArchive);
    const old = entries.filter(
      (entry) =>
        entry.path.replaceAll("\\", "/").split("/").at(-1) === "metadata.json",
    );
    if (old.length)
      await sevenZip.delete(
        stagedArchive,
        old.map((entry) => entry.path),
      );
    await writeFile(
      join(temporary, "metadata.json"),
      JSON.stringify(metadata, null, "\t"),
      "utf8",
    );
    await sevenZip.add(stagedArchive, ["metadata.json"], {
      cwd: temporary,
      recursive: false,
    });
    await rename(stagedArchive, file_path);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/**
 * Read file to upload to Workshop
 * @param file_path path to the file to be uploaded
 * @param target_url target PUT url
 */
export async function uploadCompressedFile(
  file_path: string,
  target_url: string,
  file_md5: string,
) {
  const fileStream = createReadStream(file_path);
  const fileStat = statSync(file_path);

  try {
    const response = await axios({
      method: "put",
      url: target_url,
      data: fileStream,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": fileStat.size,
        "Content-MD5": file_md5,
      },
      onUploadProgress: (progressEvent) => {
        getMainWindow()?.webContents.send(
          "workshop::upload-progress",
          progressEvent,
        );
      },
    });
    return response.data;
  } catch (error) {
    const normalized = normalizeError(error, ERRORS.NETWORK_REQUEST_FAILED);
    getMainWindow()?.webContents.send("workshop::upload-error", toErrorDto(normalized));
    throw normalized;
  }
}

/**
 * Download file using axios.get to request url
 * @param url presigned file path
 */
export async function downloadCompressedFile(url: string) {
  const target_path = ""; // change this later;
  const fileWriter = createWriteStream(target_path);

  try {
    const response = await axios({
      method: "get",
      url: url,
      responseType: "stream",
      onDownloadProgress: (progressEvent) => {
        getMainWindow()?.webContents.send(
          "workshop::download-progress",
          progressEvent,
        );
      },
    });

    await promisify(pipeline)(response.data, fileWriter);
  } catch (error) {
    console.log(error);
  }
}
