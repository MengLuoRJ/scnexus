import { ipcHandle } from "@/utils/ipc-util";

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
import {
  runGameClient,
  runGameExecutable,
  runEditorExecutable,
} from "./client-launcher";

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
  ipcHandle("customize:run-game-executable", runGameExecutable);
  ipcHandle("customize:run-editor-executable", runEditorExecutable);
}
