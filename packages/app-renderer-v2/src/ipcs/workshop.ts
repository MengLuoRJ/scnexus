import { bridgeRequest } from "./internal/bridge";
export const apiWorkshopGetFileMd5 = (path: string) =>
  bridgeRequest<string>("workshop:get-file-md5", path);
export const apiWorkshopGetFileMd5Wasm = (path: string) =>
  bridgeRequest<string>("workshop:get-file-md5-wasm", path);
export const apiWorkshopWriteMetadata = (path: string, metadata: Record<string, unknown>) =>
  bridgeRequest<void>("workshop:write-metadata", path, metadata);
export const apiWorkshopUploadCompressedFile = (path: string, targetUrl: string, md5: string) =>
  bridgeRequest<unknown>("workshop:upload-compressed-file", path, targetUrl, md5);
