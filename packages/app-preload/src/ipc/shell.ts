import * as api from "@scnexus/app-shared/ipc/shell";
import { exposeApis, invoke } from "./common.js";

export const apiShellOpenExternalWebsite = (link: string) =>
  api.apiShellOpenExternalWebsite(invoke, link);
export const apiShellOpenPath = (path: string) =>
  api.apiShellOpenPath(invoke, path);
export const apiShellShowItemInFolder = (path: string) =>
  api.apiShellShowItemInFolder(invoke, path);

exposeApis({
  "shell:open-external-website": apiShellOpenExternalWebsite,
  "shell:open-path": apiShellOpenPath,
  "shell:show-item-in-folder": apiShellShowItemInFolder,
});
