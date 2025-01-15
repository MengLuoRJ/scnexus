import { exposeApis, invoke } from "./common.js";

export const apiShellOpenExternalWebsite = (link: string) =>
  invoke("shell:open-external-website", link);
export const apiShellOpenPath = (path: string) =>
  invoke("shell:open-path", path);
export const apiShellShowItemInFolder = (path: string) =>
  invoke("shell:show-item-in-folder", path);

exposeApis({
  "shell:open-external-website": apiShellOpenExternalWebsite,
  "shell:open-path": apiShellOpenPath,
  "shell:show-item-in-folder": apiShellShowItemInFolder,
});
