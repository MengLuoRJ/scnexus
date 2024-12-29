import { useIpcApi } from "./ipc-util";

export const ipcWorkshop = {
  getFileMd5: (path: string) =>
    useIpcApi<string>("apiWorkshopGetFileMd5", window.apiWorkshopGetFileMd5(path)),
  getFileMd5Wasm: (path: string) =>
    useIpcApi<string>("apiWorkshopGetFileMd5Wasm", window.apiWorkshopGetFileMd5Wasm(path)),

  writeMetadata: (path: string, metadata: Record<string, any>) =>
    useIpcApi<void>("apiWorkshopWriteMetadata", window.apiWorkshopWriteMetadata(path, metadata)),

  uploadCompressedFile: (
    file_path: string,
    target_url: string,
    file_md5: string
  ) =>
    useIpcApi<void>("apiWorkshopUploadCompressedFile", window.apiWorkshopUploadCompressedFile(file_path, target_url, file_md5)),
};
