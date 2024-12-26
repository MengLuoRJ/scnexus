import type { ApiInvoke } from "./types";

export const apiWorkshopGetFileMd5 = (invoke: ApiInvoke, path: string) =>
  invoke("workshop:get-file-md5", path);
export const apiWorkshopGetFileMd5Wasm = (invoke: ApiInvoke, path: string) =>
  invoke("workshop:get-file-md5-wasm", path);
export const apiWorkshopWriteMetadata = (
  invoke: ApiInvoke,
  path: string,
  metadata: Record<string, unknown>,
) => invoke("workshop:write-metadata", path, metadata);
export const apiWorkshopUploadCompressedFile = (
  invoke: ApiInvoke,
  filePath: string,
  targetUrl: string,
  fileMd5: string,
) => invoke("workshop:upload-compressed-file", filePath, targetUrl, fileMd5);
