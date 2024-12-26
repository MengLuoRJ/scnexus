import type { ApiInvoke } from "./types";

export const apiCustomizeReadCompressFileInfo = (
  invoke: ApiInvoke,
  path: string,
) => invoke("customize:read-compress-file-info", path);
export const apiCustomizeInstallCompressFile = (
  invoke: ApiInvoke,
  path: string,
) => invoke("customize:install-compress-file", path);
export const apiCustomizeValidateCompressFile = (
  invoke: ApiInvoke,
  path: string,
) => invoke("customize:validate-compress-file", path);
export const apiCustomizeReadCompressFileInfo7z = (
  invoke: ApiInvoke,
  path: string,
) => invoke("customize:read-compress-file-info-7z", path);
export const apiCustomizeInstallCompressFile7z = (
  invoke: ApiInvoke,
  path: string,
) => invoke("customize:install-compress-file-7z", path);
export const apiCustomizeInstallCustomize = (
  invoke: ApiInvoke,
  info: unknown,
) => invoke("customize:install-customize", info);
export const apiCustomizeUninstallCustomize = (
  invoke: ApiInvoke,
  info: unknown,
) => invoke("customize:uninstall-customize", info);
export const apiCustomizeGetInstalledCustomizeList = (invoke: ApiInvoke) =>
  invoke("customize:get-installed-customize-list");
export const apiCustomizeScanInstalledCustomizeList = (invoke: ApiInvoke) =>
  invoke("customize:scan-installed-customize-list");
export const apiCustomizeRunGameClient = (invoke: ApiInvoke, path?: string) =>
  invoke("customize:run-game-client", path);
export const apiCustomizeRunGameExecutable = (
  invoke: ApiInvoke,
  parameters?: unknown,
) => invoke("customize:run-game-executable", parameters);
export const apiCustomizeRunEditorExecutable = (
  invoke: ApiInvoke,
  path?: string,
) => invoke("customize:run-editor-executable", path);
