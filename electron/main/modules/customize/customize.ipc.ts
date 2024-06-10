import { ipcHandle } from "@electron/main/utils/ipc-util";

import {
  installCompressFile,
  installCompressFile7z,
  readCompressFileInfo,
  readCompressFileInfo7z,
  validateCompressFile,
} from "./compress-process";
import {
  getInstalledCustomizeList,
  installCustomize,
  scanInstalledCustomizeList,
  uninstallCustomize,
} from "./customize-manage";
import { runEditorClient, runGameClient } from "./client-launcher";
import { unzipSZ } from "./compress-compatible";

export function initCustomizeIpc() {
  ipcHandle("customize:read-compress-file-info", readCompressFileInfo);
  ipcHandle("customize:install-compress-file", installCompressFile);
  ipcHandle("customize:validate-compress-file", validateCompressFile);

  ipcHandle("customize:read-compress-file-info-7z", readCompressFileInfo7z);
  ipcHandle("customize:install-compress-file-7z", installCompressFile7z);

  ipcHandle("customize:install-customize", installCustomize);
  ipcHandle("customize:uninstall-customize", uninstallCustomize);
  ipcHandle(
    "customize:get-installed-customize-list",
    getInstalledCustomizeList
  );
  ipcHandle(
    "customize:scan-installed-customize-list",
    scanInstalledCustomizeList
  );

  ipcHandle("customize:run-game-client", runGameClient);
  ipcHandle("customize:run-editor-client", runEditorClient);

  ipcHandle("customize:unzip-sz", unzipSZ);
}
