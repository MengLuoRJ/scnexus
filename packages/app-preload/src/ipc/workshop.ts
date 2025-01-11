import * as api from "@scnexus/app-shared/ipc/workshop";
import { exposeApis, invoke } from "./common.js";

export const apiWorkshopGetFileMd5 = (path: string) =>
  api.apiWorkshopGetFileMd5(invoke, path);
export const apiWorkshopGetFileMd5Wasm = (path: string) =>
  api.apiWorkshopGetFileMd5Wasm(invoke, path);
export const apiWorkshopWriteMetadata = (
  path: string,
  metadata: Record<string, unknown>,
) => api.apiWorkshopWriteMetadata(invoke, path, metadata);
export const apiWorkshopUploadCompressedFile = (
  filePath: string,
  targetUrl: string,
  fileMd5: string,
) => api.apiWorkshopUploadCompressedFile(invoke, filePath, targetUrl, fileMd5);

exposeApis({
  "workshop:get-file-md5": apiWorkshopGetFileMd5,
  "workshop:get-file-md5-wasm": apiWorkshopGetFileMd5Wasm,
  "workshop:write-metadata": apiWorkshopWriteMetadata,
  "workshop:upload-compressed-file": apiWorkshopUploadCompressedFile,
});
