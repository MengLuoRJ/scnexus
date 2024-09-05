import { ipcHandle } from "@/utils/ipc-util";
import { getFileMd5, getFileMd5Wasm } from "./workshop-util";
import {
  uploadCompressedFile,
  writeMetadataToCompressedFile,
} from "./workshop-service";

export function initWorkshopIpc() {
  ipcHandle("workshop:get-file-md5", getFileMd5);
  ipcHandle("workshop:get-file-md5-wasm", getFileMd5Wasm);

  ipcHandle("workshop:write-metadata", writeMetadataToCompressedFile);
  ipcHandle("workshop:upload-compressed-file", uploadCompressedFile);
}
