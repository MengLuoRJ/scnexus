import { exposeApis, invoke } from "./common.js";

export const apiCustomizeReadCompressFileInfo = (path: string) =>
  invoke("customize:read-compress-file-info", path);
export const apiCustomizeInstallCompressFile = (path: string) =>
  invoke("customize:install-compress-file", path);
export const apiCustomizeValidateCompressFile = (path: string) =>
  invoke("customize:validate-compress-file", path);
export const apiCustomizeReadCompressFileInfo7z = (path: string) =>
  invoke("customize:read-compress-file-info-7z", path);
export const apiCustomizeInstallCompressFile7z = (path: string) =>
  invoke("customize:install-compress-file-7z", path);
export const apiCustomizeInstallCustomize = (info: unknown) =>
  invoke("customize:install-customize", info);
export const apiCustomizeUninstallCustomize = (info: unknown) =>
  invoke("customize:uninstall-customize", info);
export const apiCustomizeGetInstalledCustomizeList = () =>
  invoke("customize:get-installed-customize-list");
export const apiCustomizeScanInstalledCustomizeList = () =>
  invoke("customize:scan-installed-customize-list");
export const apiCustomizeRunGameClient = (path?: string) =>
  invoke("customize:run-game-client", path);
export const apiCustomizeRunGameExecutable = (parameters?: unknown) =>
  invoke("customize:run-game-executable", parameters);
export const apiCustomizeRunEditorExecutable = (path?: string) =>
  invoke("customize:run-editor-executable", path);

exposeApis({
  "customize:read-compress-file-info": apiCustomizeReadCompressFileInfo,
  "customize:install-compress-file": apiCustomizeInstallCompressFile,
  "customize:validate-compress-file": apiCustomizeValidateCompressFile,
  "customize:read-compress-file-info-7z": apiCustomizeReadCompressFileInfo7z,
  "customize:install-compress-file-7z": apiCustomizeInstallCompressFile7z,
  "customize:install-customize": apiCustomizeInstallCustomize,
  "customize:uninstall-customize": apiCustomizeUninstallCustomize,
  "customize:get-installed-customize-list":
    apiCustomizeGetInstalledCustomizeList,
  "customize:scan-installed-customize-list":
    apiCustomizeScanInstalledCustomizeList,
  "customize:run-game-client": apiCustomizeRunGameClient,
  "customize:run-game-executable": apiCustomizeRunGameExecutable,
  "customize:run-editor-executable": apiCustomizeRunEditorExecutable,
});
