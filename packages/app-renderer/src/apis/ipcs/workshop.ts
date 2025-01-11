import { ipcApi, useIpcApi } from './ipc-util'

export const apiWorkshopGetFileMd5 = (path: string) =>
  useIpcApi<string>('apiWorkshopGetFileMd5', ipcApi['workshop:get-file-md5'](path))
export const apiWorkshopGetFileMd5Wasm = (path: string) =>
  useIpcApi<string>('apiWorkshopGetFileMd5Wasm', ipcApi['workshop:get-file-md5-wasm'](path))
export const apiWorkshopWriteMetadata = (path: string, metadata: Record<string, any>) =>
  useIpcApi<void>('apiWorkshopWriteMetadata', ipcApi['workshop:write-metadata'](path, metadata))
export const apiWorkshopUploadCompressedFile = (
  file_path: string,
  target_url: string,
  file_md5: string,
) =>
  useIpcApi<void>(
    'apiWorkshopUploadCompressedFile',
    ipcApi['workshop:upload-compressed-file'](file_path, target_url, file_md5),
  )
