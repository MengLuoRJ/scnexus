import { exposeApis, invoke } from '../ipc-common.js'

export const apiWorkshopGetFileMd5 = (path: string) => invoke('workshop:get-file-md5', path)
export const apiWorkshopGetFileMd5Wasm = (path: string) =>
  invoke('workshop:get-file-md5-wasm', path)
export const apiWorkshopWriteMetadata = (path: string, metadata: Record<string, unknown>) =>
  invoke('workshop:write-metadata', path, metadata)
export const apiWorkshopUploadCompressedFile = (
  filePath: string,
  targetUrl: string,
  fileMd5: string,
) => invoke('workshop:upload-compressed-file', filePath, targetUrl, fileMd5)

exposeApis({
  'workshop:get-file-md5': apiWorkshopGetFileMd5,
  'workshop:get-file-md5-wasm': apiWorkshopGetFileMd5Wasm,
  'workshop:write-metadata': apiWorkshopWriteMetadata,
  'workshop:upload-compressed-file': apiWorkshopUploadCompressedFile,
})
