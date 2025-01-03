import * as api from "@scnexus/app-shared/ipc/customize";
import { exposeApis, invoke } from "./common.js";

export const apiCustomizeReadCompressFileInfo = (path: string) => api.apiCustomizeReadCompressFileInfo(invoke, path);
export const apiCustomizeInstallCompressFile = (path: string) => api.apiCustomizeInstallCompressFile(invoke, path);
export const apiCustomizeValidateCompressFile = (path: string) => api.apiCustomizeValidateCompressFile(invoke, path);
export const apiCustomizeReadCompressFileInfo7z = (path: string) => api.apiCustomizeReadCompressFileInfo7z(invoke, path);
export const apiCustomizeInstallCompressFile7z = (path: string) => api.apiCustomizeInstallCompressFile7z(invoke, path);
export const apiCustomizeInstallCustomize = (info: unknown) => api.apiCustomizeInstallCustomize(invoke, info);
export const apiCustomizeUninstallCustomize = (info: unknown) => api.apiCustomizeUninstallCustomize(invoke, info);
export const apiCustomizeGetInstalledCustomizeList = () => api.apiCustomizeGetInstalledCustomizeList(invoke);
export const apiCustomizeScanInstalledCustomizeList = () => api.apiCustomizeScanInstalledCustomizeList(invoke);
export const apiCustomizeRunGameClient = (path?: string) => api.apiCustomizeRunGameClient(invoke, path);
export const apiCustomizeRunGameExecutable = (parameters?: unknown) => api.apiCustomizeRunGameExecutable(invoke, parameters);
export const apiCustomizeRunEditorExecutable = (path?: string) => api.apiCustomizeRunEditorExecutable(invoke, path);

exposeApis({
  apiCustomizeReadCompressFileInfo,
  apiCustomizeInstallCompressFile,
  apiCustomizeValidateCompressFile,
  apiCustomizeReadCompressFileInfo7z,
  apiCustomizeInstallCompressFile7z,
  apiCustomizeInstallCustomize,
  apiCustomizeUninstallCustomize,
  apiCustomizeGetInstalledCustomizeList,
  apiCustomizeScanInstalledCustomizeList,
  apiCustomizeRunGameClient,
  apiCustomizeRunGameExecutable,
  apiCustomizeRunEditorExecutable,
});
