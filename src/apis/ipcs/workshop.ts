import { useIpcRendererInvoke } from "./ipc-util";

const moduleChannel = "workshop";

export const ipcWorkshop = {
  getFileMd5: (path: string) =>
    useIpcRendererInvoke<string>(`${moduleChannel}:get-file-md5`, path),
  getFileMd5Wasm: (path: string) =>
    useIpcRendererInvoke<string>(`${moduleChannel}:get-file-md5-wasm`, path),

  writeMetadata: (path: string, metadata: Record<string, any>) =>
    useIpcRendererInvoke<void>(
      `${moduleChannel}:write-metadata`,
      path,
      metadata
    ),

  uploadCompressedFile: (
    file_path: string,
    target_url: string,
    file_md5: string
  ) =>
    useIpcRendererInvoke<void>(
      `${moduleChannel}:upload-compressed-file`,
      file_path,
      target_url,
      file_md5
    ),
};
