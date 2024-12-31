import * as api from "@scnexus/app-shared/ipc/customize";
import { exposeInvoke } from "./common.js";

exposeInvoke(
  "apiCustomizeReadCompressFileInfo",
  api.apiCustomizeReadCompressFileInfo,
);
exposeInvoke(
  "apiCustomizeInstallCompressFile",
  api.apiCustomizeInstallCompressFile,
);
exposeInvoke(
  "apiCustomizeValidateCompressFile",
  api.apiCustomizeValidateCompressFile,
);
exposeInvoke(
  "apiCustomizeReadCompressFileInfo7z",
  api.apiCustomizeReadCompressFileInfo7z,
);
exposeInvoke(
  "apiCustomizeInstallCompressFile7z",
  api.apiCustomizeInstallCompressFile7z,
);
exposeInvoke("apiCustomizeInstallCustomize", api.apiCustomizeInstallCustomize);
exposeInvoke(
  "apiCustomizeUninstallCustomize",
  api.apiCustomizeUninstallCustomize,
);
exposeInvoke(
  "apiCustomizeGetInstalledCustomizeList",
  api.apiCustomizeGetInstalledCustomizeList,
);
exposeInvoke(
  "apiCustomizeScanInstalledCustomizeList",
  api.apiCustomizeScanInstalledCustomizeList,
);
exposeInvoke("apiCustomizeRunGameClient", api.apiCustomizeRunGameClient);
exposeInvoke(
  "apiCustomizeRunGameExecutable",
  api.apiCustomizeRunGameExecutable,
);
exposeInvoke(
  "apiCustomizeRunEditorExecutable",
  api.apiCustomizeRunEditorExecutable,
);
