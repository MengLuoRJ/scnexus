import { getMainWindow } from "@/mainWindows";
import { pipeline } from "node:stream";
import { createReadStream, createWriteStream, statSync } from "node:fs";
import { promisify } from "node:util";
import { MetadataStandard } from "scnexus-standard/metadata";
import { getZip } from "@/utils/admzip";

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
export function writeMetadataToCompressedFile(
  file_path: string,
  metadata: MetadataStandard
) {
  const zip = getZip(file_path);
  const metadataFile = zip.getEntries().find((entry) => {
    return entry.name === "metadata.json";
  });

  if (!metadataFile) {
    zip.addFile(
      "metadata.json",
      Buffer.from(JSON.stringify(metadata, null, "\t"), "utf-8")
    );
  } else {
    zip.deleteFile(metadataFile);
    zip.addFile(
      "metadata.json",
      Buffer.from(JSON.stringify(metadata, null, "\t"), "utf-8")
    );
  }

  zip.writeZip();
}

/**
 * Read file to upload to Workshop
 * @param file_path path to the file to be uploaded
 * @param target_url target PUT url
 */
export async function uploadCompressedFile(
  file_path: string,
  target_url: string,
  file_md5: string
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
          progressEvent
        );
      },
    });
    return response.data;
  } catch (error) {
    console.log((error as any).response!.data);
    getMainWindow()?.webContents.send("workshop::upload-error", error);
    return error;
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
          progressEvent
        );
      },
    });

    await promisify(pipeline)(response.data, fileWriter);
  } catch (error) {
    console.log(error);
  }
}
