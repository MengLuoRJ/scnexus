import { ipcBridgeRequest } from './internal/bridge'
export const ipcWorkshopGetFileMd5 = (path: string) =>
  ipcBridgeRequest<string>('workshop:get-file-md5', path)
export const ipcWorkshopGetFileMd5Wasm = (path: string) =>
  ipcBridgeRequest<string>('workshop:get-file-md5-wasm', path)
export const ipcWorkshopWriteMetadata = (path: string, metadata: Record<string, unknown>) =>
  ipcBridgeRequest<void>('workshop:write-metadata', path, metadata)
export const ipcWorkshopUploadCompressedFile = (path: string, targetUrl: string, md5: string) =>
  ipcBridgeRequest<unknown>('workshop:upload-compressed-file', path, targetUrl, md5)
